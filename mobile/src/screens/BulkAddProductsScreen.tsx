import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/form/Banner';
import { Button } from '@/components/form/Button';
import { FormScreen } from '@/components/form/FormScreen';
import { PressableScale } from '@/components/PressableScale';
import { ApiRequestError } from '@/lib/api/client';
import {
  bulkUploadProducts,
  validateProductImport,
  type ImportError,
  type ImportResult,
  type ImportSummary,
  type ImportUpdate,
  type ImportValidation,
  type UploadFile,
} from '@/lib/api/products';
import { cardShadow, colors, radius, spacing } from '@/lib/theme';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const MAX_BYTES = 5 * 1024 * 1024;

// Handed to the OS picker so only spreadsheets are offered. Every name a
// platform is known to give a CSV is listed, because Android file managers
// hide a file whose MIME type isn't in the list. The name check below is
// what actually decides, matching the server's own rule: MIME types for
// .xlsx vary wildly between platforms.
const PICKER_MIME_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const REQUIRED_COLUMNS = ['Product Name', 'Sale Price'];
const OPTIONAL_COLUMNS: [string, string][] = [
  ['Product Code', 'matches an existing product, or is generated (PROD-0001…) if blank'],
  ['MRP', 'new: 0 · existing: unchanged'],
  ['Discount', 'new: 0 · existing: unchanged'],
  ['Scheme Purchase Qty', 'above 0 creates a scheme · blank leaves an existing one alone'],
  ['Scheme Bonus Qty', 'new: 0 · existing: unchanged'],
  ['Company, Packing, Unit', 'new: empty · existing: unchanged'],
];

type PickedFile = UploadFile & { name: string; type: string; size: number };

function isAcceptedName(name: string) {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// New vs existing is the thing a booker most needs to see before importing:
// it is the difference between adding a supplier's catalogue and rewriting
// the prices of products already in use.
function Breakdown({ summary }: { summary: ImportSummary }) {
  const cells: { value: number; label: string; bad?: boolean }[] = [
    { value: summary.totalRows, label: 'Rows processed' },
    { value: summary.newProducts, label: 'New to add' },
    { value: summary.updatedProducts, label: 'Existing to update' },
  ];
  if (summary.invalidRows > 0) cells.push({ value: summary.invalidRows, label: 'Rows with problems', bad: true });

  return (
    <View style={styles.breakdown}>
      {cells.map((cell) => (
        <View key={cell.label} style={[styles.breakdownCell, cell.bad && styles.breakdownBad]}>
          <Text style={[styles.breakdownValue, cell.bad && styles.breakdownBadText]}>{cell.value}</Text>
          <Text style={styles.breakdownLabel}>{cell.label}</Text>
        </View>
      ))}
    </View>
  );
}

function UpdateList({ updates }: { updates: ImportUpdate[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.disclosure}>
        <Text style={styles.disclosureText}>
          {updates.length} existing product{updates.length === 1 ? '' : 's'} will be updated
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {open
        ? updates.map((update) => (
            <View key={`${update.row}-${update.code}`} style={styles.tableRow}>
              <Text style={styles.tableRowNum}>Row {update.row}</Text>
              <View style={styles.flex1}>
                <Text style={styles.tableRowMain}>{update.name}</Text>
                <Text style={styles.tableRowMeta}>
                  {update.code} · matched by {update.matchedBy === 'code' ? 'Product Code' : 'Product Name'}
                </Text>
              </View>
            </View>
          ))
        : null}
    </View>
  );
}

function ErrorList({ errors }: { errors: ImportError[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {errors.length} problem{errors.length === 1 ? '' : 's'} to fix
      </Text>
      {errors.map((issue, index) => (
        <View key={`${issue.row}-${issue.field}-${index}`} style={styles.tableRow}>
          <Text style={styles.tableRowNum}>Row {issue.row}</Text>
          <View style={styles.flex1}>
            <Text style={styles.tableRowMain}>{issue.field}</Text>
            <Text style={styles.tableRowError}>{issue.message}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.note}>Row numbers match the rows in your spreadsheet.</Text>
    </View>
  );
}

// Bulk product import in two deliberate steps: test the file, then import
// it. Importing is all-or-nothing on the server, so the Import button stays
// disabled until a validation pass comes back completely clean. Any new
// file invalidates a previous pass - the Import button can only ever refer
// to the file that was actually checked. Mirrors the web ImportProductsModal.
export function BulkAddProductsScreen() {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState<'idle' | 'picking' | 'validating' | 'importing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);

  function resetAll() {
    setFile(null);
    setValidation(null);
    setImported(null);
    setError(null);
    setBusy('idle');
  }

  async function pickFile() {
    setBusy('picking');
    setError(null);
    setValidation(null);
    setImported(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: PICKER_MIME_TYPES,
        multiple: false,
        // On Android the file is uploaded straight from the content:// URI
        // the picker grants, which expo-file-system may always read. A
        // cached copy would land in the raw app cache, which Expo Go's
        // scoped file permissions refuse to read back. iOS copies into the
        // app's own caches directory, which is fine.
        copyToCacheDirectory: Platform.OS !== 'android',
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (!isAcceptedName(asset.name)) {
        setError(`Choose a ${ACCEPTED_EXTENSIONS.join(', ')} file.`);
        setFile(null);
        return;
      }
      const size = asset.size ?? 0;
      if (size > MAX_BYTES) {
        setError(`That file is ${formatSize(size)} - the limit is 5 MB.`);
        setFile(null);
        return;
      }
      setFile({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || 'application/octet-stream',
        file: asset.file ?? null,
        size,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the file picker.');
    } finally {
      setBusy('idle');
    }
  }

  async function handleValidate() {
    if (!file) return;
    setBusy('validating');
    setError(null);
    setImported(null);
    try {
      setValidation(await validateProductImport(file));
    } catch (err) {
      // A file that can't be read at all fails with a plain message rather
      // than row-level errors.
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setValidation(null);
    } finally {
      setBusy('idle');
    }
  }

  async function handleImport() {
    if (!file || !validation?.isValid) return;
    setBusy('importing');
    setError(null);
    try {
      const data = await bulkUploadProducts(file);
      setImported(data);
      setValidation(null);
    } catch (err) {
      // The server re-checks every row, so an import can still be refused
      // if the catalogue changed between validating and importing. Its
      // rejection carries the same row-level detail - show it as a fresh
      // validation result.
      const body = err instanceof ApiRequestError ? (err.body as Partial<ImportValidation> | null) : null;
      if (body?.errors && body.summary) {
        setValidation({ ...(body as ImportValidation), isValid: false });
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      setBusy('idle');
    }
  }

  const isBusy = busy !== 'idle';
  const canValidate = Boolean(file) && !isBusy;
  const canImport = Boolean(file) && validation?.isValid === true && !isBusy;

  return (
    <FormScreen>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spreadsheet columns</Text>
        <Text style={styles.columnsLabel}>REQUIRED</Text>
        {REQUIRED_COLUMNS.map((column) => (
          <Text key={column} style={styles.column}>
            • {column}
          </Text>
        ))}
        <Text style={[styles.columnsLabel, styles.columnsLabelOptional]}>OPTIONAL</Text>
        {OPTIONAL_COLUMNS.map(([column, behaviour]) => (
          <Text key={column} style={styles.column}>
            • {column} <Text style={styles.columnHint}>- {behaviour}</Text>
          </Text>
        ))}
        <Text style={styles.note}>
          .xlsx, .xls or .csv, up to 5 MB and 1000 rows. A row matching an existing product (by code, or by name if
          the code is blank) updates it rather than creating a duplicate.
        </Text>
      </View>

      {/* ---------------- File selection ---------------- */}
      {file ? (
        <View style={styles.fileCard}>
          <View style={styles.fileIcon}>
            <Ionicons name="document-text" size={26} color={colors.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.fileName} numberOfLines={2}>
              {file.name}
            </Text>
            <Text style={styles.fileMeta}>
              {formatSize(file.size)}
              {file.type !== 'application/octet-stream' ? ` · ${file.type}` : ''}
            </Text>
            <Pressable onPress={resetAll} disabled={isBusy} hitSlop={8}>
              <Text style={styles.changeFile}>Choose a different file</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <PressableScale style={styles.dropzone} onPress={pickFile} disabled={isBusy}>
          <Ionicons name="cloud-upload-outline" size={34} color={colors.primary} />
          <Text style={styles.dropzoneTitle}>{busy === 'picking' ? 'Opening picker…' : 'Choose a file'}</Text>
          <Text style={styles.dropzoneHint}>.xlsx, .xls or .csv - up to 5 MB</Text>
        </PressableScale>
      )}

      {error ? <Banner kind="error">{error}</Banner> : null}
      {busy === 'validating' ? <Banner kind="info">Checking every row…</Banner> : null}
      {busy === 'importing' ? <Banner kind="info">Importing…</Banner> : null}

      {/* ---------------- Validation result ---------------- */}
      {validation?.isValid ? (
        <>
          <Banner kind="success">
            <Text style={styles.bold}>File looks good.</Text> Nothing has been saved yet - press Import Products to
            apply it.
            {validation.summary.generatedCodes
              ? ` ${validation.summary.generatedCodes} product code${validation.summary.generatedCodes === 1 ? ' will be' : 's will be'} generated automatically.`
              : ''}
          </Banner>
          <Breakdown summary={validation.summary} />
          {validation.updates && validation.updates.length > 0 ? <UpdateList updates={validation.updates} /> : null}
        </>
      ) : null}

      {validation && validation.isValid === false ? (
        <>
          <Banner kind="error">
            <Text style={styles.bold}>This file can&apos;t be imported yet.</Text> {validation.summary.invalidRows} of{' '}
            {validation.summary.totalRows} rows need fixing. Nothing has been saved.
          </Banner>
          <Breakdown summary={validation.summary} />
        </>
      ) : null}

      {validation?.unmappedHeaders && validation.unmappedHeaders.length > 0 ? (
        <Banner kind="info">
          These columns weren&apos;t recognised and will be ignored: {validation.unmappedHeaders.join(', ')}. Check the
          spelling against the template if you expected them to be imported.
        </Banner>
      ) : null}

      {validation?.errors && validation.errors.length > 0 ? <ErrorList errors={validation.errors} /> : null}

      {/* ---------------- Import result ---------------- */}
      {imported ? (
        <>
          <Banner kind="success">{imported.message}</Banner>
          <Breakdown summary={imported.summary} />
        </>
      ) : null}

      {/* ---------------- Actions ---------------- */}
      {imported ? (
        <View style={styles.actions}>
          <Button title="Import Another File" variant="secondary" onPress={resetAll} style={styles.flex1} />
          <Button title="View Products" onPress={() => router.replace('/(tabs)/products')} style={styles.flex1} />
        </View>
      ) : (
        <View style={styles.actionsColumn}>
          <Button
            title={busy === 'validating' ? 'Checking…' : '1. Test / Validate File'}
            variant="secondary"
            icon="shield-checkmark-outline"
            onPress={handleValidate}
            loading={busy === 'validating'}
            disabled={!canValidate}
          />
          <Button
            title={busy === 'importing' ? 'Importing…' : '2. Upload / Import Products'}
            icon="cloud-upload-outline"
            onPress={handleImport}
            loading={busy === 'importing'}
            disabled={!canImport}
          />
          {!canImport && file && !isBusy ? (
            <Text style={styles.note}>Validate the file first - it must pass with no problems before importing.</Text>
          ) : null}
        </View>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  bold: { fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  columnsLabel: { fontSize: 11, fontWeight: '700', color: colors.danger, letterSpacing: 0.5, marginTop: spacing.xs, marginBottom: 4 },
  columnsLabelOptional: { color: colors.textMuted, marginTop: spacing.md },
  column: { fontSize: 13, color: colors.text, lineHeight: 20 },
  columnHint: { color: colors.textMuted },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginTop: spacing.md },

  dropzone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xxl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.lg,
  },
  dropzoneTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  dropzoneHint: { fontSize: 13, color: colors.textMuted },

  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: { fontSize: 15, fontWeight: '700', color: colors.text },
  fileMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  changeFile: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 6 },

  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  breakdownCell: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  breakdownBad: { borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft },
  breakdownValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  breakdownBadText: { color: colors.danger },
  breakdownLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 2 },

  disclosure: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  disclosureText: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
  tableRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  tableRowNum: { fontSize: 12, fontWeight: '700', color: colors.textMuted, width: 56 },
  tableRowMain: { fontSize: 14, fontWeight: '600', color: colors.text },
  tableRowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tableRowError: { fontSize: 13, color: colors.danger, marginTop: 2 },

  actions: { flexDirection: 'row', gap: spacing.md },
  actionsColumn: { gap: spacing.md },
});
