import { formatMoney } from '@/lib/theme';
import { HTML2CANVAS_SOURCE } from './html2canvasSource';
import { RECEIPT_COLORS as C, type Receipt } from './receiptData';

// The receipt as an HTML document - the one template behind both exports.
//
// This is the web app's receipt markup and stylesheet (OrderReceiptModal
// and the `.receipt-*` rules in index.css) carried over nearly line for
// line, so an invoice shared from the phone is the same invoice a booker
// sees in the browser. It is rendered two ways, exactly as on the web:
//
//   'pdf'   - expo-print lays it out on A4 pages. Print-only additions:
//             page geometry, the table header repeating on every page,
//             rows that don't split across a page break.
//   'image' - a WebView lays it out at the web's fixed 760px and runs
//             html2canvas on it (the same library the web JPG uses), then
//             posts the JPEG back to React Native.

export type ReceiptRenderMode = 'pdf' | 'image';

// A4 in CSS points - what expo-print's `width`/`height` options take.
export const A4 = { width: 595, height: 842 } as const;

// The web receipt's fixed width, so every JPG is identical regardless of
// the phone that made it.
export const IMAGE_WIDTH = 760;

// Messages the image renderer posts to React Native.
export type ReceiptImageMessage = { type: 'jpg'; base64: string } | { type: 'error'; message: string };

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${C.white}; }
  body {
    color: ${C.charcoal};
    font-family: -apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt { width: 100%; background: ${C.white}; }
  body.image .receipt { width: ${IMAGE_WIDTH}px; }
  .receipt-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    background: ${C.navy};
    color: ${C.white};
    padding: 22px 28px;
  }
  .receipt-brand { font-size: 22px; font-weight: 700; letter-spacing: 0.01em; }
  .receipt-tagline { font-size: 12px; color: ${C.headerMuted}; margin-top: 2px; }
  .receipt-header-right { text-align: right; }
  .receipt-number { font-size: 17px; font-weight: 700; }
  .receipt-date { font-size: 12px; color: ${C.headerMuted}; margin-top: 2px; }
  .receipt-status {
    display: inline-block;
    margin-top: 8px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: ${C.white};
  }
  .receipt-status-submitted { background: ${C.submitted}; }
  .receipt-status-cancelled { background: ${C.cancelled}; }
  .receipt-parties { display: flex; padding: 20px 28px 16px; }
  .receipt-party { width: 50%; padding-right: 20px; }
  .receipt-party-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: ${C.muted};
    margin-bottom: 4px;
  }
  .receipt-party-name { font-size: 15px; font-weight: 700; color: ${C.navy}; }
  .receipt-party-line { font-size: 12px; color: ${C.muted}; }
  /* Fixed layout with explicit column widths, so the columns sit in the
     same place on every page, screen and export. */
  .receipt-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .receipt-table thead { display: table-header-group; }
  .receipt-table tr { page-break-inside: avoid; break-inside: avoid; }
  .receipt-table col.col-product { width: 35%; }
  .receipt-table col.col-rate { width: 12%; }
  .receipt-table col.col-paid { width: 12%; }
  .receipt-table col.col-bonus { width: 10%; }
  .receipt-table col.col-discount { width: 11%; }
  .receipt-table col.col-total { width: 20%; }
  .receipt-table th,
  .receipt-table td { padding: 10px 12px; text-align: left; }
  .receipt-table thead th {
    background: ${C.navyAccent};
    color: ${C.white};
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  .receipt-table th:first-child,
  .receipt-table td:first-child { padding-left: 28px; }
  .receipt-table th:last-child,
  .receipt-table td:last-child { padding-right: 28px; }
  .receipt-table td { border-bottom: 1px solid ${C.hairline}; vertical-align: top; overflow-wrap: anywhere; }
  .receipt-table tbody tr:nth-child(even) td { background: ${C.zebra}; }
  /* Numeric headers and cells share one rule at one specificity, so the
     figures line up under their headings. */
  .receipt-table th.receipt-num,
  .receipt-table td.receipt-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .receipt-bonus-cell { display: flex; justify-content: flex-end; }
  .receipt-product { font-weight: 600; color: ${C.navy}; }
  .receipt-code { font-size: 11px; color: ${C.muted}; }
  .receipt-line-total { font-weight: 700; color: ${C.navy}; }
  .receipt-bonus {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 999px;
    background: ${C.bonusFill};
    color: ${C.bonusText};
    font-weight: 700;
    font-size: 12px;
  }
  .receipt-footer {
    display: flex;
    justify-content: space-between;
    padding: 18px 28px 26px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .receipt-remarks { width: 55%; padding-right: 24px; }
  .receipt-remarks-text { font-size: 12px; color: ${C.charcoal}; white-space: pre-wrap; }
  .receipt-note { margin-top: 10px; font-size: 11px; color: ${C.muted}; }
  .receipt-cancelled-note { margin-top: 10px; font-size: 12px; font-weight: 700; color: ${C.cancelled}; }
  .receipt-totals { width: 45%; max-width: 300px; }
  .receipt-total-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: ${C.muted};
    padding: 3px 0;
  }
  .receipt-total-row strong { color: ${C.charcoal}; font-variant-numeric: tabular-nums; }
  .receipt-grand-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding: 11px 14px;
    background: ${C.navy};
    color: ${C.white};
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .receipt-grand-total strong { font-size: 18px; font-variant-numeric: tabular-nums; }
`;

function renderLine(line: Receipt['lines'][number]) {
  return `
    <tr>
      <td>
        <div class="receipt-product">${escapeHtml(line.name)}</div>
        ${line.code ? `<div class="receipt-code">${escapeHtml(line.code)}</div>` : ''}
      </td>
      <td class="receipt-num">${escapeHtml(formatMoney(line.rate))}</td>
      <td class="receipt-num">${line.paidQty}</td>
      <td class="receipt-num">
        <div class="receipt-bonus-cell">${line.bonusQty > 0 ? `<span class="receipt-bonus">+${line.bonusQty}</span>` : '—'}</div>
      </td>
      <td class="receipt-num">${line.discount > 0 ? `${escapeHtml(formatMoney(line.discount))}%` : '—'}</td>
      <td class="receipt-num receipt-line-total">${escapeHtml(formatMoney(line.lineTotal))}</td>
    </tr>`;
}

// Runs inside the WebView once the page has laid out. Mirrors the web's
// renderCanvas(): scale 2 keeps text legible when the image is opened
// full-size on a phone, and 0.95 JPEG quality matches the web download.
// The data-URL prefix is stripped so React Native receives bare base64
// ready to write to a file.
const IMAGE_SCRIPT = `
  function post(message) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  window.addEventListener('error', function (event) {
    post({ type: 'error', message: String(event.message || 'Script error') });
  });
  window.addEventListener('load', function () {
    var target = document.querySelector('.receipt');
    var run = function () {
      html2canvas(target, { scale: 2, backgroundColor: '#FFFFFF', logging: false, useCORS: true })
        .then(function (canvas) {
          var dataUrl = canvas.toDataURL('image/jpeg', 0.95);
          post({ type: 'jpg', base64: dataUrl.slice(dataUrl.indexOf(',') + 1) });
        })
        .catch(function (err) {
          post({ type: 'error', message: String((err && err.message) || err) });
        });
    };
    // Fonts settle a frame after load; capturing before that measures the
    // fallback font and mis-wraps product names.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run, run);
    else setTimeout(run, 50);
  });
`;

export function buildReceiptHtml(receipt: Receipt, mode: ReceiptRenderMode = 'pdf') {
  const isCancelled = receipt.status === 'cancelled';
  const { customer, totals } = receipt;
  const isImage = mode === 'image';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${isImage ? IMAGE_WIDTH : 'device-width'}, initial-scale=1" />
  <title>${escapeHtml(receipt.orderNumber || 'Order')} receipt</title>
  <style>${STYLES}</style>
  ${isImage ? `<script>${HTML2CANVAS_SOURCE}</script>` : ''}
</head>
<body class="${mode}">
  <div class="receipt">
    <div class="receipt-header">
      <div>
        <div class="receipt-brand">${escapeHtml(receipt.brandName)}</div>
        ${receipt.brandTagline ? `<div class="receipt-tagline">${escapeHtml(receipt.brandTagline)}</div>` : ''}
      </div>
      <div class="receipt-header-right">
        <div class="receipt-number">${escapeHtml(receipt.orderNumber || 'DRAFT')}</div>
        <div class="receipt-date">${escapeHtml(receipt.dateLabel)}</div>
        <span class="receipt-status ${isCancelled ? 'receipt-status-cancelled' : 'receipt-status-submitted'}">
          ${escapeHtml(receipt.statusLabel.toUpperCase())}
        </span>
      </div>
    </div>

    <div class="receipt-parties">
      <div class="receipt-party">
        <div class="receipt-party-label">BILL TO</div>
        <div class="receipt-party-name">${escapeHtml(customer.name)}</div>
        ${customer.code ? `<div class="receipt-party-line">${escapeHtml(customer.code)}</div>` : ''}
        ${customer.address ? `<div class="receipt-party-line">${escapeHtml(customer.address)}</div>` : ''}
        ${customer.phone ? `<div class="receipt-party-line">${escapeHtml(customer.phone)}</div>` : ''}
      </div>
      <div class="receipt-party">
        <div class="receipt-party-label">BOOKED BY</div>
        <div class="receipt-party-name">${escapeHtml(receipt.bookerName)}</div>
      </div>
    </div>

    <table class="receipt-table">
      <colgroup>
        <col class="col-product" />
        <col class="col-rate" />
        <col class="col-paid" />
        <col class="col-bonus" />
        <col class="col-discount" />
        <col class="col-total" />
      </colgroup>
      <thead>
        <tr>
          <th>Product</th>
          <th class="receipt-num">Rate</th>
          <th class="receipt-num">Paid Qty</th>
          <th class="receipt-num">Bonus</th>
          <th class="receipt-num">Disc %</th>
          <th class="receipt-num">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${receipt.lines.map(renderLine).join('')}
      </tbody>
    </table>

    <div class="receipt-footer">
      <div class="receipt-remarks">
        ${
          receipt.remarks
            ? `<div class="receipt-party-label">REMARKS</div>
               <div class="receipt-remarks-text">${escapeHtml(receipt.remarks)}</div>`
            : ''
        }
        ${totals.bonusQty > 0 ? `<div class="receipt-note">Bonus quantity is supplied free and carries no charge.</div>` : ''}
        ${isCancelled ? `<div class="receipt-cancelled-note">This order has been cancelled and is not payable.</div>` : ''}
      </div>

      <div class="receipt-totals">
        <div class="receipt-total-row"><span>Total Paid Items</span><strong>${totals.paidQty}</strong></div>
        <div class="receipt-total-row"><span>Total Bonus Items</span><strong>${
          totals.bonusQty > 0 ? `+${totals.bonusQty} free` : '0'
        }</strong></div>
        <div class="receipt-total-row"><span>Subtotal</span><strong>${escapeHtml(formatMoney(totals.subtotal))}</strong></div>
        <div class="receipt-total-row"><span>Total Savings</span><strong>${
          totals.discountTotal > 0 ? `- ${escapeHtml(formatMoney(totals.discountTotal))}` : escapeHtml(formatMoney(0))
        }</strong></div>
        <div class="receipt-grand-total"><span>GRAND TOTAL</span><strong>${escapeHtml(formatMoney(totals.total))}</strong></div>
      </div>
    </div>
  </div>
  ${isImage ? `<script>${IMAGE_SCRIPT}</script>` : ''}
</body>
</html>`;
}
