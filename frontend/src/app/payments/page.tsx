"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatAmount, formatDate, todayIso, useCurrentUser } from "@/lib/client";
import { PAYMENT_METHODS, opts } from "@/lib/lookups";
import { Badge, BarChart, Button, Card, DataState, Field, FormError, Input, Modal, Notice, PageShell, SearchBox, Select, StatGrid, Table, Td } from "@/components/ui";

interface Payment {
  payment_id: number;
  settlement_id: number;
  claim_id: number;
  customer_name: string;
  payment_amount: string;
  settlement_amount: string;
  payment_date?: string;
  payment_method?: string;
  payment_status?: string;
  transaction_reference?: string | null;
}
interface Outstanding { settlement_id: number; claim_id: number; customer_name: string; settlement_amount: string; total_paid: string; outstanding: string; settlement_status: string | null }
interface PaymentsResponse { payments: Payment[]; total: number; totalAmount: number; byMethod: { payment_method: string; total: number; amount: string }[]; outstanding: Outstanding[] }

export default function PaymentsPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === "Admin";
  const [search, setSearch] = useState("");
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState<Outstanding | null>(null);
  const [form, setForm] = useState({ payment_amount: "", payment_date: todayIso(), payment_method: "NEFT", transaction_reference: "" });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<PaymentsResponse>(`/api/payments?search=${encodeURIComponent(search)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load payments.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  function openPay(o: Outstanding) {
    setTarget(o);
    setForm({ payment_amount: String(o.outstanding), payment_date: todayIso(), payment_method: "NEFT", transaction_reference: "" });
    setFormError("");
  }

  async function reverse(p: Payment) {
    const reason = window.prompt(`Reason for reversing payment #${p.payment_id}?`)?.trim();
    if (!reason) return;
    try {
      const res = await api<{ settlement_reopened: boolean }>(`/api/payments/${p.payment_id}`, { method: "PATCH", json: { payment_status: "Reversed", reason } });
      setNotice(`Payment #${p.payment_id} reversed${res.settlement_reopened ? " — settlement re-opened." : "."}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reverse payment.");
    }
  }

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (!target || busy) return;
    setBusy(true);
    setFormError("");
    try {
      const res = await api<{ payment_id: number; fully_paid: boolean }>("/api/payments", { method: "POST", json: { settlement_id: target.settlement_id, ...form } });
      setTarget(null);
      setNotice(`Payment #${res.payment_id} recorded${res.fully_paid ? " — settlement fully paid." : "."}`);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to record payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title="Payments" subtitle="Record and track settlement payments.">
      <Notice message={notice} onDone={() => setNotice("")} />
      <StatGrid items={[
        { label: "Payments", value: data?.total ?? "…" },
        { label: "Total paid", value: data ? formatAmount(data.totalAmount) : "…" },
        { label: "Settlements with balance", value: data?.outstanding.length ?? "…" },
        { label: "Outstanding", value: data ? formatAmount(data.outstanding.reduce((s, o) => s + Number(o.outstanding), 0)) : "…" },
      ]} />

      <Card title="Outstanding settlements">
        {!isAdmin && <p className="mb-3 text-sm text-slate-500">Only an Admin can record payments.</p>}
        <DataState loading={loading && !data} error="" empty={(data?.outstanding.length ?? 0) === 0} emptyText="Every settlement is fully paid.">
          <Table headers={["Settlement", "Claim", "Customer", "Settled", "Paid", "Outstanding", "Status", ""]}>
            {data?.outstanding.map((o) => (
              <tr key={o.settlement_id}>
                <Td>#{o.settlement_id}</Td><Td>#{o.claim_id}</Td><Td>{o.customer_name}</Td><Td>{formatAmount(o.settlement_amount)}</Td>
                <Td>{formatAmount(o.total_paid)}</Td><Td className="font-medium">{formatAmount(o.outstanding)}</Td><Td><Badge value={o.settlement_status} /></Td>
                <Td>{isAdmin && <Button className="!py-1 text-xs" onClick={() => openPay(o)}>Record payment</Button>}</Td>
              </tr>
            ))}
          </Table>
        </DataState>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Payment history">
            <div className="mb-4"><SearchBox value={search} onChange={setSearch} placeholder="Search by payment, claim or customer…" /></div>
            <DataState loading={loading && !data} error={error} empty={(data?.payments.length ?? 0) === 0} emptyText="No payments recorded.">
              <Table headers={["Payment", "Settlement", "Claim", "Customer", "Date", "Amount", "Method", "Reference", "Status", ""]}>
                {data?.payments.map((p) => (
                  <tr key={p.payment_id}>
                    <Td>#{p.payment_id}</Td><Td>#{p.settlement_id}</Td><Td>#{p.claim_id}</Td><Td>{p.customer_name}</Td>
                    <Td className="whitespace-nowrap">{formatDate(p.payment_date)}</Td><Td>{formatAmount(p.payment_amount)}</Td>
                    <Td>{p.payment_method ?? "—"}</Td><Td>{p.transaction_reference ?? "—"}</Td><Td><Badge value={p.payment_status} /></Td>
                    <Td>{isAdmin && p.payment_status !== "Reversed" && <Button variant="secondary" className="!py-1 text-xs" onClick={() => void reverse(p)}>Reverse</Button>}</Td>
                  </tr>
                ))}
              </Table>
            </DataState>
          </Card>
        </div>
        <Card title="Paid by method">
          <BarChart data={(data?.byMethod ?? []).map((m) => ({ label: m.payment_method ?? "Unspecified", value: Number(m.amount) }))} format={formatAmount} />
        </Card>
      </div>

      <Modal open={Boolean(target)} title={`Pay settlement #${target?.settlement_id ?? ""}`} onClose={() => setTarget(null)}>
        <form onSubmit={pay} className="space-y-4">
          <p className="text-sm text-slate-600">Outstanding balance: <strong>{formatAmount(target?.outstanding)}</strong></p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₹) *"><Input type="number" min="0.01" max={target?.outstanding} step="0.01" required value={form.payment_amount} onChange={(e) => setForm((f) => ({ ...f, payment_amount: e.target.value }))} /></Field>
            <Field label="Payment date"><Input type="date" max={todayIso()} value={form.payment_date} onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} /></Field>
            <Field label="Method *"><Select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} options={opts(PAYMENT_METHODS)} /></Field>
            <Field label="Transaction reference" hint="Must be unique; prevents recording the same transfer twice."><Input maxLength={50} value={form.transaction_reference} onChange={(e) => setForm((f) => ({ ...f, transaction_reference: e.target.value }))} /></Field>
          </div>
          <FormError message={formError} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Recording…" : "Record payment"}</Button></div>
        </form>
      </Modal>
    </PageShell>
  );
}
