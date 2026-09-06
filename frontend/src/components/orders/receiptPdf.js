import { formatMoney } from '../../pages/orders/orderCalc.js';
import { RECEIPT_COLORS, hexToRgb } from './receiptData.js';

// Draws the receipt as a real PDF — text as text, rules as vectors.
//
// The obvious alternative is to screenshot the HTML with html2canvas and
// paste the bitmap into a PDF. That is one less layout to maintain, but the
// result is a picture of a receipt: fuzzy when zoomed, unselectable,
// unsearchable, and hundreds of kilobytes. An order receipt gets printed,
// forwarded and read on a phone, so it is worth drawing properly. The JPG
// export still comes from the HTML, where a bitmap is exactly what is
// wanted.
//
// Both renderers take their numbers from buildReceipt(), so only the
// drawing differs.

const PAGE = { width: 210, height: 297 }; // A4 portrait, millimetres
const MARGIN = 14;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

// Widths sum to CONTENT_WIDTH. Everything except the product name is
// right-aligned, the way money reads.
const COLUMNS = [
  { key: 'name', label: 'Product', width: 74, align: 'left' },
  { key: 'rate', label: 'Rate', width: 22, align: 'right' },
  { key: 'paidQty', label: 'Paid Qty', width: 18, align: 'right' },
  { key: 'bonusQty', label: 'Bonus', width: 20, align: 'right' },
  { key: 'discount', label: 'Disc %', width: 20, align: 'right' },
  { key: 'lineTotal', label: 'Line Total', width: 28, align: 'right' },
];

const ROW_HEIGHT = 6.5;
const TABLE_HEADER_HEIGHT = 8;

function columnX(index) {
  return MARGIN + COLUMNS.slice(0, index).reduce((sum, column) => sum + column.width, 0);
}

// Right-aligned columns are drawn from their right edge, with a small inset
// so figures don't touch the rule.
function cellX(index) {
  const column = COLUMNS[index];
  return column.align === 'right' ? columnX(index) + column.width - 2 : columnX(index) + 2;
}

function setFill(doc, hex) {
  doc.setFillColor(...hexToRgb(hex));
}

function setText(doc, hex) {
  doc.setTextColor(...hexToRgb(hex));
}

function setDraw(doc, hex) {
  doc.setDrawColor(...hexToRgb(hex));
}

// The navy banner: brand on the left, order number and status on the right.
function drawHeader(doc, receipt) {
  const height = 30;
  setFill(doc, RECEIPT_COLORS.navy);
  doc.rect(0, 0, PAGE.width, height, 'F');

  setText(doc, RECEIPT_COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(receipt.brandName, MARGIN, 13);

  if (receipt.brandTagline) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(doc, '#CBD5E1');
    doc.text(receipt.brandTagline, MARGIN, 19);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setText(doc, RECEIPT_COLORS.white);
  doc.text(receipt.orderNumber || 'DRAFT', PAGE.width - MARGIN, 13, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, '#CBD5E1');
  doc.text(receipt.dateLabel, PAGE.width - MARGIN, 19, { align: 'right' });

  // A cancelled order must never be mistaken for a live one, so the status
  // is a filled chip rather than a line of text.
  const isCancelled = receipt.status === 'cancelled';
  const label = receipt.statusLabel.toUpperCase();
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  const labelWidth = doc.getTextWidth(label) + 6;
  setFill(doc, isCancelled ? '#DC2626' : '#16A34A');
  doc.roundedRect(PAGE.width - MARGIN - labelWidth, 22, labelWidth, 5.5, 1.2, 1.2, 'F');
  setText(doc, RECEIPT_COLORS.white);
  doc.text(label, PAGE.width - MARGIN - labelWidth / 2, 25.8, { align: 'center' });

  return height;
}

// Customer on the left, booker on the right.
function drawParties(doc, receipt, top) {
  let y = top + 10;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  setText(doc, RECEIPT_COLORS.muted);
  doc.text('BILL TO', MARGIN, y);
  doc.text('BOOKED BY', MARGIN + CONTENT_WIDTH / 2, y);

  y += 5.5;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  setText(doc, RECEIPT_COLORS.charcoal);
  doc.text(receipt.customer.name, MARGIN, y, { maxWidth: CONTENT_WIDTH / 2 - 6 });
  doc.text(receipt.bookerName, MARGIN + CONTENT_WIDTH / 2, y, { maxWidth: CONTENT_WIDTH / 2 });

  y += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setText(doc, RECEIPT_COLORS.muted);

  const customerLines = [receipt.customer.code, receipt.customer.address, receipt.customer.phone].filter(Boolean);
  let customerY = y;
  for (const line of customerLines) {
    const wrapped = doc.splitTextToSize(line, CONTENT_WIDTH / 2 - 6);
    doc.text(wrapped, MARGIN, customerY);
    customerY += wrapped.length * 4.4;
  }

  return Math.max(customerY, y) + 4;
}

function drawTableHeader(doc, top) {
  setFill(doc, RECEIPT_COLORS.navyAccent);
  doc.rect(MARGIN, top, CONTENT_WIDTH, TABLE_HEADER_HEIGHT, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  setText(doc, RECEIPT_COLORS.white);

  COLUMNS.forEach((column, index) => {
    doc.text(column.label, cellX(index), top + 5.4, { align: column.align });
  });

  return top + TABLE_HEADER_HEIGHT;
}

// Returns the height the row needs, so the caller can page-break before
// drawing one that wouldn't fit.
function measureRow(doc, line) {
  doc.setFontSize(9);
  const nameLines = doc.splitTextToSize(line.name, COLUMNS[0].width - 4);
  const codeLine = line.code ? 1 : 0;
  return Math.max(ROW_HEIGHT, nameLines.length * 4.2 + codeLine * 3.6 + 3);
}

function drawRow(doc, line, top, index) {
  const height = measureRow(doc, line);

  if (index % 2 === 1) {
    setFill(doc, RECEIPT_COLORS.zebra);
    doc.rect(MARGIN, top, CONTENT_WIDTH, height, 'F');
  }

  const textTop = top + 4.4;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setText(doc, RECEIPT_COLORS.charcoal);

  const nameLines = doc.splitTextToSize(line.name, COLUMNS[0].width - 4);
  doc.text(nameLines, cellX(0), textTop);

  if (line.code) {
    doc.setFontSize(7.5);
    setText(doc, RECEIPT_COLORS.muted);
    doc.text(line.code, cellX(0), textTop + nameLines.length * 4.2);
    doc.setFontSize(9);
    setText(doc, RECEIPT_COLORS.charcoal);
  }

  doc.text(formatMoney(line.rate), cellX(1), textTop, { align: 'right' });
  doc.text(String(line.paidQty), cellX(2), textTop, { align: 'right' });

  // Bonus is free stock, so it is coloured rather than left to look like
  // another number that was paid for.
  if (line.bonusQty > 0) {
    const label = `+${line.bonusQty}`;
    doc.setFont('helvetica', 'bold');
    const width = doc.getTextWidth(label) + 4;
    setFill(doc, RECEIPT_COLORS.bonusFill);
    doc.roundedRect(cellX(3) - width, textTop - 3.4, width, 4.8, 1, 1, 'F');
    setText(doc, RECEIPT_COLORS.bonusText);
    doc.text(label, cellX(3) - 2, textTop, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    setText(doc, RECEIPT_COLORS.charcoal);
  } else {
    setText(doc, RECEIPT_COLORS.muted);
    doc.text('—', cellX(3), textTop, { align: 'right' });
    setText(doc, RECEIPT_COLORS.charcoal);
  }

  doc.text(line.discount > 0 ? `${formatMoney(line.discount)}%` : '—', cellX(4), textTop, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text(formatMoney(line.lineTotal), cellX(5), textTop, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  setDraw(doc, RECEIPT_COLORS.hairline);
  doc.setLineWidth(0.1);
  doc.line(MARGIN, top + height, MARGIN + CONTENT_WIDTH, top + height);

  return top + height;
}

function drawTotals(doc, receipt, top) {
  const boxWidth = 78;
  const boxX = MARGIN + CONTENT_WIDTH - boxWidth;
  let y = top + 6;

  const rows = [
    ['Total Paid Items', String(receipt.totals.paidQty)],
    ['Total Bonus Items', receipt.totals.bonusQty > 0 ? `+${receipt.totals.bonusQty} free` : '0'],
    ['Subtotal', formatMoney(receipt.totals.subtotal)],
    ['Total Savings', receipt.totals.discountTotal > 0 ? `- ${formatMoney(receipt.totals.discountTotal)}` : formatMoney(0)],
  ];

  doc.setFontSize(9);
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal');
    setText(doc, RECEIPT_COLORS.muted);
    doc.text(label, boxX, y);
    doc.setFont('helvetica', 'bold');
    setText(doc, RECEIPT_COLORS.charcoal);
    doc.text(value, MARGIN + CONTENT_WIDTH, y, { align: 'right' });
    y += 5.6;
  }

  y += 1;
  setFill(doc, RECEIPT_COLORS.navy);
  doc.rect(boxX, y, boxWidth, 12, 'F');
  setText(doc, RECEIPT_COLORS.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('GRAND TOTAL', boxX + 4, y + 7.5);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(formatMoney(receipt.totals.total), MARGIN + CONTENT_WIDTH - 4, y + 8, { align: 'right' });

  return y + 12;
}

function drawRemarks(doc, receipt, top) {
  if (!receipt.remarks) return top;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  setText(doc, RECEIPT_COLORS.muted);
  doc.text('REMARKS', MARGIN, top + 6);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setText(doc, RECEIPT_COLORS.charcoal);
  const wrapped = doc.splitTextToSize(receipt.remarks, CONTENT_WIDTH - 88);
  doc.text(wrapped, MARGIN, top + 11);

  return top + 11 + wrapped.length * 4.4;
}

function drawFooter(doc, receipt, pageNumber, pageCount) {
  const y = PAGE.height - 10;
  setDraw(doc, RECEIPT_COLORS.hairline);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y - 5, MARGIN + CONTENT_WIDTH, y - 5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  setText(doc, RECEIPT_COLORS.muted);
  doc.text(`${receipt.brandName} · ${receipt.orderNumber || ''}`, MARGIN, y);
  doc.text(`Page ${pageNumber} of ${pageCount}`, PAGE.width - MARGIN, y, { align: 'right' });
}

// Builds the whole document and hands back the jsPDF instance.
export async function buildReceiptPdf(receipt) {
  // Loaded on demand: jsPDF is a large dependency and most sessions never
  // export a receipt, so it stays out of the initial bundle.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  let y = drawHeader(doc, receipt);
  y = drawParties(doc, receipt, y);
  y = drawTableHeader(doc, y);

  // Leaves room for the totals block and the footer on the final page.
  const bodyLimit = PAGE.height - 20;

  receipt.lines.forEach((line, index) => {
    const height = measureRow(doc, line);
    if (y + height > bodyLimit) {
      doc.addPage();
      y = drawTableHeader(doc, MARGIN);
    }
    y = drawRow(doc, line, y, index);
  });

  const totalsHeight = 46 + (receipt.remarks ? 16 : 0);
  if (y + totalsHeight > bodyLimit) {
    doc.addPage();
    y = MARGIN;
  }

  const afterTotals = drawTotals(doc, receipt, y);
  drawRemarks(doc, receipt, y);

  if (receipt.status === 'cancelled') {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    setText(doc, '#DC2626');
    doc.text('This order has been cancelled and is not payable.', MARGIN, afterTotals + 8);
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawFooter(doc, receipt, page, pageCount);
  }

  return doc;
}
