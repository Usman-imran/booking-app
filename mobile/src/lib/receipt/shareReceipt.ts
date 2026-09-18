import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { A4, buildReceiptHtml } from './receiptHtml';
import { receiptFileName, type Receipt } from './receiptData';

export type ReceiptFormat = 'jpg' | 'pdf';

// Where exported receipts live between being generated and being handed to
// another app. The OS may clear the cache at any time, which is right for a
// file that only exists to be attached to a chat.
//
// The receipt is written here from bytes rather than moved from wherever
// expo-print dropped its own temp file. That lands in the raw app cache,
// and Expo's file-permission service - which the File API and expo-sharing
// both consult - only allows the app's sanctioned directories; in Expo Go
// that is the experience's scoped folder alone. Moving or sharing the temp
// file directly is refused with "Missing READ permission", while writing
// under Paths.cache is always permitted, and it gives the file its proper
// name ("ORD-…-receipt.pdf" rather than "Print-7f3a.pdf") in the same step.
function receiptFile(receipt: Receipt, format: ReceiptFormat) {
  const dir = new Directory(Paths.cache, 'receipts');
  if (!dir.exists) dir.create({ idempotent: true });
  const file = new File(dir, receiptFileName(receipt, format));
  if (file.exists) file.delete();
  return file;
}

function writeBase64(file: File, base64: string) {
  file.write(base64, { encoding: 'base64' });
  return file;
}

// The JPEG bytes come from ReceiptImageRenderer - html2canvas over the
// same HTML template the PDF is printed from - so this only files them.
export function exportReceiptJpg(receipt: Receipt, base64: string) {
  return writeBase64(receiptFile(receipt, 'jpg'), base64);
}

// A real, paginated PDF from the same HTML template the web shows.
export async function exportReceiptPdf(receipt: Receipt) {
  const { base64 } = await Print.printToFileAsync({
    html: buildReceiptHtml(receipt),
    width: A4.width,
    height: A4.height,
    // The template draws its own edge-to-edge navy header, so the page
    // itself has no margin.
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    base64: true,
  });
  if (!base64) throw new Error('The PDF was created but could not be read back.');
  return writeBase64(receiptFile(receipt, 'pdf'), base64);
}

const SHARE_TYPES: Record<ReceiptFormat, { mimeType: string; UTI: string }> = {
  jpg: { mimeType: 'image/jpeg', UTI: 'public.jpeg' },
  pdf: { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' },
};

// Opens the OS share sheet with the file, where WhatsApp, email, Drive and
// every other installed app that accepts the type is offered. Nothing is
// pre-addressed: the booker picks the recipient in the app they choose,
// where their real contact list is.
export async function shareReceiptFile(file: File, receipt: Receipt, format: ReceiptFormat) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    ...SHARE_TYPES[format],
    dialogTitle: `Share receipt ${receipt.orderNumber || ''}`.trim(),
  });
}
