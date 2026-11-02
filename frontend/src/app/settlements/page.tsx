"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatAmount, formatDate, todayIso, useCurrentUser } from "@/lib/client";
import { SETTLEMENT_STATUSES, opts } from "@/lib/lookups";
import { Badge, Button, Card, DataState, Field, FormError, Input, Modal, Notice, PageShell, SearchBox, Select, StatGrid, Table, Td } from "@/components/ui";

interface Settlement {
  settlement_id: number;
  claim_id: number;
  customer_name: string;
  claimed_amount: string;
  settlement_amount: string;
  settlement_status: string | null;
  settlement_date?: string;
  total_paid: string;
  outstanding: string;
  payment_count: number;
}
interface Eligible { claim_id: number; customer_name: string; claimed_amount: string; assessed_amount: string; recommendation: string }
interface SettlementsResponse { settlements: Settlement[]; total: number; totalAmount: number; totalPaid: number; eligibleClaims: Eligible[] }

export default function SettlementsPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === "Admin";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<SettlementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState<Eligible | null>(null);
  const [form, setForm] = useState({ settlement_amount: "", settlement_date: todayIso() });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<SettlementsResponse>(`/api/settlements?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load settlements.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  function openSettle(e: Eligible) {
    setTarget(e);
    setForm({ settlement_amount: String(e.assessed_amount), settlement_date: todayIso() });
    setFormError("");
  }

  async function settle(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    setBusy(true);
    setFormError("");
    try {
      const res = await api<{ settlement_id: number }>("/api/settlements", { method: "POST", json: { claim_id: target.claim_id, ...form } });
      setTarget(null);
      setNotice(`Settlement #${res.settlement_id} created; claim #${target.claim_id} is now Settled.`);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to create settlement.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(s: Settlement, next: string) {
    try {
      await api(`/api/settlements/${s.settlement_id}`, { method: "PATCH", json: { settlement_status: next } });
      setNotice(`Settlement #${s.settlement_id} is now ${next}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update settlement.");
    }
  }

  return (
    <PageShell title="Settlements" subtitle="Create and manage claim settlements.">
      <Notice message={notice} onDone={() => setNotice("")} />
      <StatGrid items={[
        { label: "Settlements", value: data?.total ?? "…" },
        { label: "Total settled", value: data ? formatAmount(data.totalAmount) : "…" },
        { label: "Total paid", value: data ? formatAmount(data.totalPaid) : "…" },
        { label: "Ready to settle", value: data?.eligibleClaims.length ?? "…" },
      ]} />

      <Card title="Claims ready for settlement">
        {!isAdmin && <p className="mb-3 text-sm text-slate-500">Only an Admin can create settlements.</p>}
        <DataState loading={loading && !data} error="" empty={(data?.eligibleClaims.length ?? 0) === 0} emptyText="No approved claims are waiting for settlement.">
          <Table headers={["Claim", "Customer", "Claimed", "Assessed", "Recommendation", ""]}>
            {data?.eligibleClaims.map((e) => (
              <tr key={e.claim_id}>
                <Td>#{e.claim_id}</Td><Td>{e.customer_name}</Td><Td>{formatAmount(e.claimed_amount)}</Td><Td>{formatAmount(e.assessed_amount)}</Td><Td>{e.recommendation}</Td>
                <Td>{isAdmin && <Button onClick={() => openSettle(e)} className="!py-1 text-xs">Settle</Button>}</Td>
              </tr>
            ))}
          </Table>
        </DataState>
      </Card>

      <Card title="All settlements">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <SearchBox value={search} onChange={setSearch} placeholder="Search by settlement, claim or customer…" />
          <div className="sm:w-48"><Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={opts(SETTLEMENT_STATUSES)} placeholder="All statuses" /></div>
        </div>
        <DataState loading={loading && !data} error={error} empty={(data?.settlements.length ?? 0) === 0} emptyText="No settlements found.">
          <Table headers={["Settlement", "Claim", "Customer", "Date", "Claimed", "Settled", "Paid", "Outstanding", "Status"]}>
            {data?.settlements.map((s) => (
              <tr key={s.settlement_id}>
                <Td>#{s.settlement_id}</Td><Td>#{s.claim_id}</Td><Td>{s.customer_name}</Td><Td className="whitespace-nowrap">{formatDate(s.settlement_date)}</Td>
                <Td>{formatAmount(s.claimed_amount)}</Td><Td>{formatAmount(s.settlement_amount)}</Td>
                <Td>{formatAmount(s.total_paid)} <span className="text-xs text-slate-500">({s.payment_count})</span></Td>
                <Td>{formatAmount(s.outstanding)}</Td>
                <Td>
                  {isAdmin ? (
                    <select aria-label="Settlement status" value={s.settlement_status ?? ""} onChange={(e) => changeStatus(s, e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
                      {!SETTLEMENT_STATUSES.includes(s.settlement_status ?? "") && <option value={s.settlement_status ?? ""}>{s.settlement_status ?? "—"}</option>}
                      {SETTLEMENT_STATUSES.map((st) => <option key={st}>{st}</option>)}
                    </select>
                  ) : <Badge value={s.settlement_status} />}
                </Td>
              </tr>
            ))}
          </Table>
        </DataState>
      </Card>

      <Modal open={Boolean(target)} title={`Settle claim #${target?.claim_id ?? ""}`} onClose={() => setTarget(null)}>
        <form onSubmit={settle} className="space-y-4">
          <p className="text-sm text-slate-600">Assessed amount: <strong>{formatAmount(target?.assessed_amount)}</strong>. The settlement cannot exceed it.</p>
          <Field label="Settlement amount (₹) *"><Input type="number" min="0.01" max={target?.assessed_amount} step="0.01" required value={form.settlement_amount} onChange={(e) => setForm((f) => ({ ...f, settlement_amount: e.target.value }))} /></Field>
          <Field label="Settlement date"><Input type="date" value={form.settlement_date} onChange={(e) => setForm((f) => ({ ...f, settlement_date: e.target.value }))} /></Field>
          <FormError message={formError} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create settlement"}</Button></div>
        </form>
      </Modal>
    </PageShell>
  );
}
