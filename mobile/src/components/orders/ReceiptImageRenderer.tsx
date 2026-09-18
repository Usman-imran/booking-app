import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { buildReceiptHtml, IMAGE_WIDTH, type ReceiptImageMessage } from '@/lib/receipt/receiptHtml';
import type { Receipt } from '@/lib/receipt/receiptData';

type Props = {
  receipt: Receipt;
  onResult: (base64: string) => void;
  onError: (message: string) => void;
};

// html2canvas on a mid-range phone takes a second or two for a receipt;
// anything past this is a WebView that never loaded.
const TIMEOUT_MS = 30_000;

// Turns the receipt HTML into a JPEG the way the web app does - html2canvas
// running over the real, laid-out template - only here the template lives
// in a hidden WebView and the bytes come back through postMessage.
//
// Mounted only for the duration of one export, then unmounted by the
// caller. The WebView is laid out at the receipt's full width inside a
// zero-height clip, so it costs no screen space but the page still has
// real geometry for html2canvas to measure.
export function ReceiptImageRenderer({ receipt, onResult, onError }: Props) {
  const html = useMemo(() => buildReceiptHtml(receipt, 'image'), [receipt]);
  // Exactly one outcome is reported, whichever arrives first.
  const settled = useRef(false);

  function settle(callback: () => void) {
    if (settled.current) return;
    settled.current = true;
    callback();
  }

  useEffect(() => {
    const timer = setTimeout(() => settle(() => onError('Timed out while drawing the image.')), TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.clip} pointerEvents="none">
      <WebView
        source={{ html }}
        originWhitelist={['*']}
        style={styles.page}
        javaScriptEnabled
        scrollEnabled={false}
        onMessage={(event) => {
          let message: ReceiptImageMessage;
          try {
            message = JSON.parse(event.nativeEvent.data);
          } catch {
            settle(() => onError('The image renderer sent an unreadable reply.'));
            return;
          }
          settle(() => (message.type === 'jpg' ? onResult(message.base64) : onError(message.message)));
        }}
        onError={(event) => settle(() => onError(event.nativeEvent.description || 'The image renderer failed to load.'))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { height: 0, overflow: 'hidden' },
  // Tall enough for a long receipt's layout; html2canvas captures the
  // element's own bounds, not the viewport, so the exact figure is moot.
  page: { width: IMAGE_WIDTH, height: 1600, backgroundColor: '#FFFFFF' },
});
