// The one place an order's status turns into a badge, so Draft, Submitted
// and Cancelled look identical everywhere they appear (PROJECT_SPEC.md §25
// asks for the three to be clearly distinguishable).
const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  cancelled: 'Cancelled',
};

export default function OrderStatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}
