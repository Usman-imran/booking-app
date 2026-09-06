import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getOrder } from '../../api/orders.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatMoney } from '../../pages/orders/orderCalc.js';
import { buildReceipt, receiptFileName } from './receiptData.js';
import { buildReceiptPdf } from './receiptPdf.js';

function triggerDownload(blobOrUrl, filename) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (typeof blobOrUrl !== 'string') URL.revokeObjectURL(url);
}

// A printable receipt for an order, exportable as PDF or JPG and shareable
// to WhatsApp.
//
// Takes either a full `order` (the details page already has one) or an
// `orderId` to fetch (the list only has summaries), so both entry points
// can open the same modal without the list having to carry line items.
export default function OrderReceiptModal({ open, order: providedOrder, orderId, onClose }) {
  // The receipt is headed with the booker's own company (falling back
  // inside buildReceipt when there isn't one).
  const { user } = useAuth();
  const [order, setOrder] = useState(providedOrder ?? null);
  const [status, setStatus] = useState(providedOrder ? 'ready' : 'loading');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // null | 'pdf' | 'image' | 'whatsapp'
  const [notice, setNotice] = useState(null);

  const receiptRef = useRef(null);

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
      setError(err.message);
      setStatus('error');
    }
  }, [id, providedOrder]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const receipt = useMemo(
    () => (order ? buildReceipt(order, { companyName: user?.companyName }) : null),
    [order, user?.companyName]
  );

  if (!open) return null;

  // Rendered at a fixed pixel width so the capture is identical on every
  // screen — a receipt that reflows with the browser window would export
  // differently depending on who pressed the button.
  async function renderCanvas() {
    const { default: html2canvas } = await import('html2canvas');
    return html2canvas(receiptRef.current, {
      // scale 2 keeps text legible when the image is opened full-size on a
      // phone; higher scales bloat the file for no visible gain.
      scale: 2,
      backgroundColor: '#FFFFFF',
      logging: false,
      useCORS: true,
    });
  }

  async function handleDownloadPdf() {
    setBusy('pdf');
    setNotice(null);
    try {
      const doc = await buildReceiptPdf(receipt);
      doc.save(receiptFileName(receipt, 'pdf'));
      setNotice('PDF downloaded.');
    } catch (err) {
      setNotice(`Could not create the PDF: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadImage() {
    setBusy('image');
    setNotice(null);
    try {
      const canvas = await renderCanvas();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      triggerDownload(dataUrl, receiptFileName(receipt, 'jpg'));
      setNotice('Image downloaded.');
    } catch (err) {
      setNotice(`Could not create the image: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  // No web API can hand a file to WhatsApp from a link, so the receipt is
  // downloaded first and WhatsApp is simply opened for the user to pick a
  // chat and attach it.
  //
  // web.whatsapp.com rather than wa.me or api.whatsapp.com/send: with no
  // number to target, those two land on WhatsApp's marketing page or a
  // download prompt, while this opens straight into the chat list for an
  // already-signed-in user — which is the whole point of the button.
  //
  // Nothing is pre-filled and no number is targeted: the booker picks the
  // recipient in WhatsApp itself, where their real contact list is.
  async function handleWhatsApp() {
    setBusy('whatsapp');
    setNotice(null);
    try {
      const canvas = await renderCanvas();
      triggerDownload(canvas.toDataURL('image/jpeg', 0.95), receiptFileName(receipt, 'jpg'));

      window.open('https://web.whatsapp.com/', '_blank', 'noopener,noreferrer');

      setNotice('Receipt image saved and WhatsApp opened — pick a chat and attach the saved image.');
    } catch (err) {
      setNotice(`Could not prepare the share: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  const isBusy = busy !== null;

  return (
    <div className="dialog-overlay" onClick={isBusy ? undefined : onClose}>
      <div
        className="dialog-card dialog-card-receipt"
        role="dialog"
        aria-modal="true"
        aria-label="Order receipt"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Share / Export Receipt</h3>

        {status === 'loading' && <div className="page-placeholder">Loading order…</div>}

        {status === 'error' && (
          <div className="page-placeholder">
            <p>Could not load this order: {error}</p>
            <button type="button" className="btn-secondary" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && receipt && (
          <>
            <div className="receipt-preview">
              {/* The node html2canvas captures. Fixed width, plain colours,
                  no CSS the capture library can't parse. */}
              <div className="receipt" ref={receiptRef}>
                <div className="receipt-header">
                  <div>
                    <div className="receipt-brand">{receipt.brandName}</div>
                    {receipt.brandTagline && <div className="receipt-tagline">{receipt.brandTagline}</div>}
                  </div>
                  <div className="receipt-header-right">
                    <div className="receipt-number">{receipt.orderNumber || 'DRAFT'}</div>
                    <div className="receipt-date">{receipt.dateLabel}</div>
                    <span
                      className={
                        receipt.status === 'cancelled'
                          ? 'receipt-status receipt-status-cancelled'
                          : 'receipt-status receipt-status-submitted'
                      }
                    >
                      {receipt.statusLabel.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="receipt-parties">
                  <div className="receipt-party">
                    <div className="receipt-party-label">BILL TO</div>
                    <div className="receipt-party-name">{receipt.customer.name}</div>
                    {receipt.customer.code && <div className="receipt-party-line">{receipt.customer.code}</div>}
                    {receipt.customer.address && <div className="receipt-party-line">{receipt.customer.address}</div>}
                    {receipt.customer.phone && <div className="receipt-party-line">{receipt.customer.phone}</div>}
                  </div>
                  <div className="receipt-party">
                    <div className="receipt-party-label">BOOKED BY</div>
                    <div className="receipt-party-name">{receipt.bookerName}</div>
                  </div>
                </div>

                <table className="receipt-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="receipt-num">Rate</th>
                      <th className="receipt-num">Paid Qty</th>
                      <th className="receipt-num">Bonus</th>
                      <th className="receipt-num">Disc %</th>
                      <th className="receipt-num">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.lines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <div className="receipt-product">{line.name}</div>
                          {line.code && <div className="receipt-code">{line.code}</div>}
                        </td>
                        <td className="receipt-num">{formatMoney(line.rate)}</td>
                        <td className="receipt-num">{line.paidQty}</td>
                        <td className="receipt-num">
                          {line.bonusQty > 0 ? <span className="receipt-bonus">+{line.bonusQty}</span> : '—'}
                        </td>
                        <td className="receipt-num">{line.discount > 0 ? `${formatMoney(line.discount)}%` : '—'}</td>
                        <td className="receipt-num receipt-line-total">{formatMoney(line.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="receipt-footer">
                  <div className="receipt-remarks">
                    {receipt.remarks && (
                      <>
                        <div className="receipt-party-label">REMARKS</div>
                        <div className="receipt-remarks-text">{receipt.remarks}</div>
                      </>
                    )}
                    {receipt.totals.bonusQty > 0 && (
                      <div className="receipt-note">
                        Bonus quantity is supplied free and carries no charge.
                      </div>
                    )}
                    {receipt.status === 'cancelled' && (
                      <div className="receipt-cancelled-note">This order has been cancelled and is not payable.</div>
                    )}
                  </div>

                  <div className="receipt-totals">
                    <div className="receipt-total-row">
                      <span>Total Paid Items</span>
                      <strong>{receipt.totals.paidQty}</strong>
                    </div>
                    <div className="receipt-total-row">
                      <span>Total Bonus Items</span>
                      <strong>{receipt.totals.bonusQty > 0 ? `+${receipt.totals.bonusQty} free` : '0'}</strong>
                    </div>
                    <div className="receipt-total-row">
                      <span>Subtotal</span>
                      <strong>{formatMoney(receipt.totals.subtotal)}</strong>
                    </div>
                    <div className="receipt-total-row">
                      <span>Total Savings</span>
                      <strong>
                        {receipt.totals.discountTotal > 0
                          ? `- ${formatMoney(receipt.totals.discountTotal)}`
                          : formatMoney(0)}
                      </strong>
                    </div>
                    <div className="receipt-grand-total">
                      <span>GRAND TOTAL</span>
                      <strong>{formatMoney(receipt.totals.total)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {notice && (
              <div className="banner-info" role="status">
                {notice}
              </div>
            )}

            <div className="dialog-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={isBusy}>
                Close
              </button>
              <button type="button" className="btn-secondary" onClick={handleDownloadImage} disabled={isBusy}>
                {busy === 'image' ? 'Creating…' : 'Download JPG'}
              </button>
              <button type="button" className="btn-secondary" onClick={handleDownloadPdf} disabled={isBusy}>
                {busy === 'pdf' ? 'Creating…' : 'Download PDF'}
              </button>
              <button type="button" className="btn-primary" onClick={handleWhatsApp} disabled={isBusy}>
                {busy === 'whatsapp' ? 'Preparing…' : 'Share via WhatsApp'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
