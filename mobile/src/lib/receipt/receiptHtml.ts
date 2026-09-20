import { formatMoney } from '@/lib/theme';
import { HTML2CANVAS_SOURCE } from './html2canvasSource';
import { RECEIPT_COLORS as C, type Receipt } from './receiptData';

// The receipt as an HTML document - the one template behind both exports.
//
// Descended from the former web app's receipt markup and stylesheet, then
// tightened so that an order of up to 25 lines fits on ONE A4 page: the
// header, parties and totals are kept compact and every table row is a
// single short line. The sizes below are tuned against that budget (see
// the notes on STYLES); ReceiptView.tsx mirrors them for the on-screen
// preview. It is rendered two ways:
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

// Sizing budget for one A4 page (842pt tall, drawn edge to edge):
//   header ~60 + parties ~66 + table head ~20 + 25 rows x 18 = 450 +
//   footer ~125 = ~720, leaving room for a few product names that wrap.
// Everything is in px, which expo-print maps 1:1 to points; checked by
// printing a 25-line order through headless Chrome at 595x842.
const STYLES = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${C.white}; }
  body {
    color: ${C.charcoal};
    font-family: -apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5px;
    line-height: 1.2;
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
    padding: 12px 22px;
  }
  .receipt-brand { font-size: 18px; font-weight: 700; letter-spacing: 0.01em; line-height: 1.2; }
  .receipt-tagline { font-size: 10.5px; color: ${C.headerMuted}; margin-top: 2px; }
  .receipt-header-right { text-align: right; }
  .receipt-number { font-size: 14px; font-weight: 700; line-height: 1.2; }
  /* Date and status share a line to keep the header short. */
  .receipt-date { font-size: 10.5px; color: ${C.headerMuted}; margin-top: 3px; }
  .receipt-status {
    display: inline-block;
    vertical-align: middle;
    margin-left: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1.3;
    color: ${C.white};
  }
  .receipt-status-submitted { background: ${C.submitted}; }
  .receipt-status-cancelled { background: ${C.cancelled}; }
  .receipt-parties { display: flex; padding: 8px 22px 6px; }
  .receipt-party { width: 50%; padding-right: 16px; }
  .receipt-party-label {
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: ${C.muted};
    margin-bottom: 2px;
  }
  .receipt-party-name { font-size: 12.5px; font-weight: 700; color: ${C.navy}; }
  .receipt-party-code { font-size: 9.5px; font-weight: 400; color: ${C.muted}; margin-left: 6px; white-space: nowrap; }
  .receipt-party-line { font-size: 10px; color: ${C.muted}; }
  /* Fixed layout with explicit column widths, so the columns sit in the
     same place on every page, screen and export. Left to right: S.NO,
     product, qty, bonus, discount, rate, line total. */
  .receipt-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .receipt-table thead { display: table-header-group; }
  .receipt-table tr { page-break-inside: avoid; break-inside: avoid; }
  /* The S.NO column carries the 22px page gutter, so it needs the extra
     width for its two or three digits. */
  .receipt-table col.col-serial { width: 9%; }
  .receipt-table col.col-product { width: 41%; }
  .receipt-table col.col-paid { width: 7%; }
  .receipt-table col.col-bonus { width: 8%; }
  .receipt-table col.col-discount { width: 9%; }
  .receipt-table col.col-rate { width: 11%; }
  .receipt-table col.col-total { width: 15%; }
  .receipt-table th,
  .receipt-table td { padding: 2px 7px; text-align: left; }
  .receipt-table thead th {
    background: ${C.navyAccent};
    color: ${C.white};
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .receipt-table th:first-child,
  .receipt-table td:first-child { padding-left: 22px; }
  .receipt-table th:last-child,
  .receipt-table td:last-child { padding-right: 22px; }
  .receipt-table td { border-bottom: 1px solid ${C.hairline}; vertical-align: top; overflow-wrap: anywhere; }
  .receipt-table tbody tr:nth-child(even) td { background: ${C.zebra}; }
  /* Numeric headers and cells share one rule at one specificity, so the
     figures line up under their headings. */
  .receipt-table th.receipt-num,
  .receipt-table td.receipt-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .receipt-table th.receipt-center,
  .receipt-table td.receipt-center { text-align: center; font-variant-numeric: tabular-nums; }
  .receipt-serial { color: ${C.muted}; white-space: nowrap; overflow-wrap: normal; }
  /* Name and code share one line, so a row stays ~18px tall unless the
     name itself is long enough to wrap. */
  .receipt-product { font-weight: 600; color: ${C.navy}; }
  .receipt-code { font-weight: 400; font-size: 9px; color: ${C.muted}; margin-left: 5px; white-space: nowrap; }
  .receipt-line-total { font-weight: 700; color: ${C.navy}; }
  .receipt-bonus {
    display: inline-block;
    padding: 0 6px;
    border-radius: 999px;
    background: ${C.bonusFill};
    color: ${C.bonusText};
    font-weight: 700;
    font-size: 9.5px;
    line-height: 13px;
  }
  .receipt-footer {
    display: flex;
    justify-content: space-between;
    padding: 10px 22px 14px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .receipt-remarks { width: 55%; padding-right: 20px; }
  .receipt-remarks-text { font-size: 10.5px; color: ${C.charcoal}; white-space: pre-wrap; }
  .receipt-note { margin-top: 6px; font-size: 9.5px; color: ${C.muted}; }
  .receipt-cancelled-note { margin-top: 6px; font-size: 10.5px; font-weight: 700; color: ${C.cancelled}; }
  .receipt-totals { width: 45%; max-width: 260px; }
  .receipt-total-row {
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    color: ${C.muted};
    padding: 1.5px 0;
  }
  .receipt-total-row strong { color: ${C.charcoal}; font-variant-numeric: tabular-nums; }
  .receipt-grand-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;
    padding: 8px 12px;
    background: ${C.navy};
    color: ${C.white};
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .receipt-grand-total strong { font-size: 15px; font-variant-numeric: tabular-nums; }
`;

function renderLine(line: Receipt['lines'][number]) {
  return `
    <tr>
      <td class="receipt-center receipt-serial">${line.serial}</td>
      <td>
        <span class="receipt-product">${escapeHtml(line.name)}</span>${
          line.code ? `<span class="receipt-code">${escapeHtml(line.code)}</span>` : ''
        }
      </td>
      <td class="receipt-num">${line.paidQty}</td>
      <td class="receipt-num">${line.bonusQty > 0 ? `<span class="receipt-bonus">+${line.bonusQty}</span>` : '—'}</td>
      <td class="receipt-num">${line.discount > 0 ? `${escapeHtml(formatMoney(line.discount))}%` : '—'}</td>
      <td class="receipt-num">${escapeHtml(formatMoney(line.rate))}</td>
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
        <div class="receipt-date">
          ${escapeHtml(receipt.dateLabel)}
          <span class="receipt-status ${isCancelled ? 'receipt-status-cancelled' : 'receipt-status-submitted'}">${escapeHtml(
            receipt.statusLabel.toUpperCase()
          )}</span>
        </div>
      </div>
    </div>

    <div class="receipt-parties">
      <div class="receipt-party">
        <div class="receipt-party-label">BILL TO</div>
        <div class="receipt-party-name">${escapeHtml(customer.name)}${
          customer.code ? `<span class="receipt-party-code">${escapeHtml(customer.code)}</span>` : ''
        }</div>
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
        <col class="col-serial" />
        <col class="col-product" />
        <col class="col-paid" />
        <col class="col-bonus" />
        <col class="col-discount" />
        <col class="col-rate" />
        <col class="col-total" />
      </colgroup>
      <thead>
        <tr>
          <th class="receipt-center">S.NO</th>
          <th>Product Name</th>
          <th class="receipt-num">Qty</th>
          <th class="receipt-num">Bonus</th>
          <th class="receipt-num">Disc %</th>
          <th class="receipt-num">Rate</th>
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
