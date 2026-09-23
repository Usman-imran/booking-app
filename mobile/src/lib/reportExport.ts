import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getReport, type ReportRow, type ReportType } from './api/reports';

// Sales report -> CSV file -> share sheet. CSV rather than .xlsx: Excel,
// Google Sheets and WPS all open it directly, and it needs no spreadsheet
// library in the bundle. A Pro feature; the screen checks the plan.

const PAGE_SIZE = 200; // the API's maximum
const MAX_PAGES = 50; // 10,000 rows - far beyond any real report

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TITLES: Record<ReportType, string> = {
  daily: 'Daily Sales',
  monthly: 'Monthly Sales',
  customer: 'Customer-wise Sales',
  product: 'Product-wise Sales',
  company: 'Company-wise Sales',
  range: 'Date-range Sales',
};

type Column = { header: string; value: (row: ReportRow) => string | number | null | undefined };

// Amounts go out as plain numbers (no thousands separators) so the
// spreadsheet can sum and sort them.
const COLUMNS: Record<ReportType, Column[]> = {
  daily: [
    { header: 'Date', value: (row) => row.period },
    { header: 'Valid Orders', value: (row) => row.orders },
    { header: 'Sales', value: (row) => row.sales },
  ],
  monthly: [
    { header: 'Month', value: (row) => (row.month ? `${MONTHS[row.month - 1]} ${row.year}` : row.period) },
    { header: 'Valid Orders', value: (row) => row.orders },
    { header: 'Sales', value: (row) => row.sales },
  ],
  customer: [
    { header: 'Customer', value: (row) => row.customerName },
    { header: 'Code', value: (row) => row.customerCode },
    { header: 'Valid Orders', value: (row) => row.orders },
    { header: 'Sales', value: (row) => row.sales },
  ],
  product: [
    { header: 'Product', value: (row) => row.productName },
    { header: 'Code', value: (row) => row.productCode },
    { header: 'Paid Qty', value: (row) => row.paidQty ?? 0 },
    { header: 'Bonus Qty (free)', value: (row) => row.bonusQty ?? 0 },
    { header: 'Valid Orders', value: (row) => row.orders },
    { header: 'Sales', value: (row) => row.sales },
  ],
  company: [
    { header: 'Company', value: (row) => row.company ?? 'No company recorded' },
    { header: 'Products', value: (row) => row.products ?? 0 },
    { header: 'Paid Qty', value: (row) => row.paidQty ?? 0 },
    { header: 'Bonus Qty (free)', value: (row) => row.bonusQty ?? 0 },
    { header: 'Valid Orders', value: (row) => row.orders },
    { header: 'Sales', value: (row) => row.sales },
  ],
  range: [
    { header: 'Period', value: (row) => row.period },
    { header: 'Valid Orders', value: (row) => row.orders },
    { header: 'Sales', value: (row) => row.sales },
  ],
};

// One CSV field. Quoted when it has to be, and a text value that a
// spreadsheet would run as a formula (a customer named "=HYPERLINK(...)")
// is defused with a leading apostrophe.
function field(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function line(values: (string | number | null | undefined)[]) {
  return values.map(field).join(',');
}

export async function exportReportCsv({ type, dateFrom, dateTo }: { type: ReportType; dateFrom: string; dateTo: string }) {
  // Every page, not just what's scrolled into view.
  const rows: ReportRow[] = [];
  let summary = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const report = await getReport({ type, dateFrom, dateTo, page, limit: PAGE_SIZE });
    summary = report.summary;
    rows.push(...report.rows);
    if (page >= report.pagination.totalPages) break;
  }

  const columns = COLUMNS[type];
  const period = dateFrom || dateTo ? `${dateFrom || 'beginning'} to ${dateTo || 'today'}` : 'All time';
  const csvLines = [
    line([TITLES[type]]),
    line(['Period', period]),
    line(['Exported', new Date().toLocaleString()]),
    '',
    line(columns.map((column) => column.header)),
    ...rows.map((row) => line(columns.map((column) => column.value(row)))),
  ];
  if (summary) {
    csvLines.push(
      '',
      line(['Total Sales', summary.sales]),
      line(['Valid Orders', summary.orders]),
      line(['Gross', summary.subtotal]),
      line(['Discount', summary.discountTotal]),
      line(['Paid Qty Sold', summary.paidQty]),
      line(['Bonus Qty (free)', summary.bonusQty])
    );
  }

  // The byte-order mark tells Excel the file is UTF-8, so names in Urdu or
  // with accents don't come out garbled.
  const csv = `﻿${csvLines.join('\r\n')}\r\n`;

  const dir = new Directory(Paths.cache, 'exports');
  // Under Paths.cache, like receipts: sharable, and properly named.
  if (!dir.exists) dir.create({ idempotent: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(dir, `sales-${type}-${stamp}.csv`);
  if (file.exists) file.delete();
  file.write(csv);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: `${TITLES[type]} (CSV)`,
  });
  return rows.length;
}
