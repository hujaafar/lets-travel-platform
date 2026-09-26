import { useEffect, useState } from "react";
import { ArrowDownLeft, ReceiptText, Search } from "lucide-react";
import { api } from "./api";
import "./transactionLedger.css";

type Transaction = {
  id: string;
  travel_title: string;
  traveler_name: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  is_demo: boolean;
  created_at: string;
};
const labels: Record<string, string> = {
  CONFIRMED: "Paid",
  PENDING: "Pending",
  CANCEL_REQUESTED: "Refund pending",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};
export default function TransactionLedger() {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api<Transaction[]>("/payments/transactions")
      .then((data) => {
        if (alive) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  const visible = rows.filter(
    (row) =>
      (filter === "ALL" || row.status === filter) &&
      `${row.travel_title} ${row.traveler_name} ${row.id} ${row.provider}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="transaction-ledger" aria-label="Transaction history">
      <div className="ledger-heading">
        <div>
          <span className="eyebrow">THE PAYMENT JOURNAL</span>
          <h2>
            <ReceiptText size={24} /> Transaction history
          </h2>
          <p>
            Recent booking activity. Demo entries are examples, not provider
            settlements.
          </p>
        </div>
        <span className="ledger-count">{rows.length} records</span>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="ledger-controls">
        <label>
          <Search size={17} />
          <input
            aria-label="Search transactions"
            placeholder="Traveler, journey or reference"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="ledger-status">
          Status
          <select
            aria-label="Filter transaction status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="ALL">All activity</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className="ledger-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable transaction table"
      >
        <table>
          <caption className="ledger-caption">
            {loading
              ? "Loading transactions…"
              : `${visible.length} matching transactions`}
          </caption>
          <thead>
            <tr>
              <th>Journey / traveler</th>
              <th>Reference</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.travel_title}</strong>
                  <span>{row.traveler_name || "Former traveler"}</span>
                </td>
                <td>
                  <code>{row.id.slice(0, 8).toUpperCase()}</code>
                  {row.is_demo && <span className="ledger-demo">Demo</span>}
                </td>
                <td>{row.provider === "STRIPE" ? "Stripe" : "PayPal"}</td>
                <td className="ledger-amount">
                  {new Intl.NumberFormat("en", {
                    style: "currency",
                    currency: row.currency.trim(),
                  }).format(Number(row.amount))}
                </td>
                <td>
                  <span className={`ledger-state ${row.status.toLowerCase()}`}>
                    {row.status === "REFUNDED" && <ArrowDownLeft size={13} />}
                    {labels[row.status] || row.status}
                  </span>
                </td>
                <td>
                  {new Date(row.created_at).toLocaleDateString("en", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !visible.length && (
        <p className="ledger-empty">No transactions match this view.</p>
      )}
    </section>
  );
}
