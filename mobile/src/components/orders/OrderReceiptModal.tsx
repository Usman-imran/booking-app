import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState } from '../ErrorState';
import { Banner } from '../form/Banner';
import { Button } from '../form/Button';
import { ReceiptImageRenderer } from './ReceiptImageRenderer';
import { ReceiptPreview } from './ReceiptView';
import { getOrder, type OrderDetail } from '@/lib/api/orders';
import { useAuth } from '@/lib/auth/AuthContext';
import { buildReceipt, type Receipt } from '@/lib/receipt/receiptData';
import { exportReceiptJpg, exportReceiptPdf, shareReceiptFile, type ReceiptFormat } from '@/lib/receipt/shareReceipt';
import { colors, spacing } from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Either a full order (the details screen already has one) or an id to
  // fetch (the list only has summaries), so both entry points open the
  // same sheet without the list having to carry line items.
  order?: OrderDetail | null;
  orderId?: string | null;
};

// A JPG export in flight: the hidden renderer is mounted with this receipt
// and settles the promise when html2canvas reports back.
type ImageJob = { receipt: Receipt; resolve: (base64: string) => void; reject: (error: Error) => void };

// The order's invoice, previewed and shared as a JPG or a PDF through the
// OS share sheet - WhatsApp, email, Drive, anything installed that takes
// the file. The mobile counterpart of the web's OrderReceiptModal, and
// both files come from the same HTML template as the web's.
export function OrderReceiptModal({ visible, onClose, order: providedOrder, orderId }: Props) {
  // The receipt is headed with the booker's own company (falling back
  // inside buildReceipt when there isn't one).
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(providedOrder ?? null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(providedOrder ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReceiptFormat | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [imageJob, setImageJob] = useState<ImageJob | null>(null);

  const id = providedOrder?.id ?? orderId;

  const load = useCallback(async () => {
    if (providedOrder) {
      setOrder(providedOrder);
      setStatus('ready');
      return;
    }
    if (!id) return;
    setStatus('loading');
    setError(null);
    try {
      const data = await getOrder(id);
      setOrder(data.order);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [id, providedOrder]);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [visible, load]);

  // A stale failure notice is cleared on close, so reopening starts clean.
  function close() {
    setProblem(null);
    onClose();
  }

  const receipt = useMemo(
    () => (order ? buildReceipt(order, { companyName: user?.companyName, bookerName: user?.name }) : null),
    [order, user?.companyName, user?.name]
  );

  // Mounts the renderer and waits for its one reply.
  function renderImage(target: Receipt) {
    return new Promise<string>((resolve, reject) => setImageJob({ receipt: target, resolve, reject }));
  }

  async function share(format: ReceiptFormat) {
    if (!receipt) return;
    setBusy(format);
    setProblem(null);
    try {
      const file =
        format === 'jpg' ? exportReceiptJpg(receipt, await renderImage(receipt)) : await exportReceiptPdf(receipt);
      await shareReceiptFile(file, receipt, format);
    } catch (err) {
      setProblem(`Could not share the ${format.toUpperCase()}: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setImageJob(null);
      setBusy(null);
    }
  }

  const isBusy = busy !== null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={isBusy ? undefined : close} presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Share Order</Text>
          <Pressable onPress={close} hitSlop={8} disabled={isBusy}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        {status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.muted}>Loading order…</Text>
          </View>
        ) : status === 'error' || !receipt ? (
          <ErrorState message={`Could not load this order: ${error}`} onRetry={load} />
        ) : (
          <>
            <ScrollView style={styles.flex1} contentContainerStyle={styles.preview}>
              <ReceiptPreview receipt={receipt} />
              <Text style={styles.hint}>
                Share the invoice as an image or a PDF. The share sheet lists WhatsApp and every other app on this phone
                that can take the file.
              </Text>
            </ScrollView>

            {imageJob ? (
              <ReceiptImageRenderer
                receipt={imageJob.receipt}
                onResult={imageJob.resolve}
                onError={(message) => imageJob.reject(new Error(message))}
              />
            ) : null}

            <View style={styles.actions}>
              {problem ? <Banner kind="error">{problem}</Banner> : null}
              <View style={styles.actionRow}>
                <Button
                  title={busy === 'jpg' ? 'Drawing…' : 'Share as JPG'}
                  icon="image-outline"
                  variant="secondary"
                  onPress={() => share('jpg')}
                  loading={busy === 'jpg'}
                  disabled={isBusy}
                  style={styles.flex1}
                />
                <Button
                  title={busy === 'pdf' ? 'Creating…' : 'Share as PDF'}
                  icon="document-text-outline"
                  onPress={() => share('pdf')}
                  loading={busy === 'pdf'}
                  disabled={isBusy}
                  style={styles.flex1}
                />
              </View>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { color: colors.textMuted, fontSize: 13 },
  // The grey mat behind the page, as on the web preview.
  preview: { padding: spacing.lg, gap: spacing.md },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, textAlign: 'center' },
  actions: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionRow: { flexDirection: 'row', gap: spacing.md },
});
