"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatAmount, formatDate, useCurrentUser } from "@/lib/client";
import { POLICY_STATUSES, opts, useLookups } from "@/lib/lookups";
import { Badge, Button, Card, DataState, Field, FormError, Input, Modal, Notice, PageShell, SearchBox, Select, SmallButton, StatGrid, Table, Td } from "@/components/ui";

interface Policy {
  policy_id: number;
  customer_id: number;
  policy_type_id: number;
  customer_name: string;
  policy_name: string;
  start_date: string;
  end_date: string;
  premium_amount: string;
  coverage_amount: string;
  policy_status: string;
  claim_count: number;
  total_claimed: string;
}
interface PoliciesResponse { policies: Policy[]; total: number; policyTypes: number; activePolicies: number }

const empty = { customer_id: "", policy_type_id: "", start_date: "", end_date: "", premium_amount: "", coverage_amount: "", policy_status: "Active" };

export default function PoliciesPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === "Admin";
  const { lookups } = useLookups();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<PoliciesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Policy | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<PoliciesResponse>(`/api/policies?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load policies.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  function openForm(policy: Policy | null) {
    setEditing(policy);
    setForm(policy ? {
      customer_id: String(policy.customer_id), policy_type_id: String(policy.policy_type_id), start_date: policy.start_date, end_date: policy.end_date,
      premium_amount: String(policy.premium_amount), coverage_amount: String(policy.coverage_amount), policy_status: policy.policy_status,
    } : empty);
    setFormError("");
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    try {
      if (editing) await api(`/api/policies/${editing.policy_id}`, { method: "PUT", json: form });
      else await api("/api/policies", { method: "POST", json: form });
      setOpen(false);
      setNotice(editing ? "Policy updated." : "Policy created.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save policy.");
    }
  }

  async function changeStatus(policy: Policy, next: string) {
    try {
      await api(`/api/policies/${policy.policy_id}`, { method: "PATCH", json: { policy_status: next } });
      setNotice(`Policy #${policy.policy_id} is now ${next}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change status.");
    }
  }

  async function remove(policy: Policy) {
    if (!window.confirm(`Delete policy #${policy.policy_id}?`)) return;
    try {
      await api(`/api/policies/${policy.policy_id}`, { method: "DELETE" });
      setNotice("Policy deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete policy.");
    }
  }

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <PageShell title="Policies" subtitle="Create, view, edit and manage insurance policies." actions={isAdmin && <Button onClick={() => openForm(null)}>Create policy</Button>}>
      <Notice message={notice} onDone={() => setNotice("")} />
      <StatGrid items={[
        { label: "Total policies", value: data?.total ?? "…" },
        { label: "Active policies", value: data?.activePolicies ?? "…" },
        { label: "Policy types", value: data?.policyTypes ?? "…" },
        { label: "Shown", value: data?.policies.length ?? "…" },
      ]} />
      <Card>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <SearchBox value={search} onChange={setSearch} placeholder="Search by policy, customer or type…" />
          <div className="sm:w-48"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={opts(POLICY_STATUSES)} placeholder="All statuses" /></div>
        </div>
        <DataState loading={loading && !data} error={error} empty={(data?.policies.length ?? 0) === 0} emptyText="No policies found.">
          <Table headers={["Policy", "Customer", "Type", "Period", "Premium", "Coverage", "Claims", "Status", "Actions"]}>
            {data?.policies.map((p) => (
              <tr key={p.policy_id}>
                <Td>#{p.policy_id}</Td><Td>{p.customer_name}</Td><Td>{p.policy_name}</Td>
                <Td className="whitespace-nowrap">{formatDate(p.start_date)} – {formatDate(p.end_date)}</Td>
                <Td>{formatAmount(p.premium_amount)}</Td><Td>{formatAmount(p.coverage_amount)}</Td>
                <Td>{p.claim_count} <span className="text-xs text-slate-500">({formatAmount(p.total_claimed)})</span></Td>
                <Td>
                  {isAdmin ? (
                    <select aria-label="Policy status" value={p.policy_status} onChange={(e) => changeStatus(p, e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
                      {POLICY_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  ) : <Badge value={p.policy_status} />}
                </Td>
                <Td className="whitespace-nowrap">
                  {isAdmin && <SmallButton onClick={() => openForm(p)}>Edit</SmallButton>}
                  {isAdmin && <SmallButton className="text-red-700" onClick={() => remove(p)}>Delete</SmallButton>}
                </Td>
              </tr>
            ))}
          </Table>
        </DataState>
      </Card>

      <Modal open={open} title={editing ? `Edit policy #${editing.policy_id}` : "Create policy"} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer *"><Select required value={form.customer_id} onChange={set("customer_id")} placeholder="Select customer" options={(lookups?.customers ?? []).map((c) => ({ value: c.customer_id, label: `${c.name} (#${c.customer_id})` }))} /></Field>
            <Field label="Policy type *"><Select required value={form.policy_type_id} onChange={set("policy_type_id")} placeholder="Select type" options={(lookups?.policyTypes ?? []).map((t) => ({ value: t.policy_type_id, label: t.policy_name }))} /></Field>
            <Field label="Start date *"><Input type="date" required value={form.start_date} onChange={set("start_date")} /></Field>
            <Field label="End date *"><Input type="date" required value={form.end_date} onChange={set("end_date")} /></Field>
            <Field label="Premium (₹) *"><Input type="number" min="0.01" step="0.01" required value={form.premium_amount} onChange={set("premium_amount")} /></Field>
            <Field label="Coverage (₹) *"><Input type="number" min="1" step="0.01" required value={form.coverage_amount} onChange={set("coverage_amount")} /></Field>
            <Field label="Status"><Select value={form.policy_status} onChange={set("policy_status")} options={opts(POLICY_STATUSES)} /></Field>
          </div>
          <FormError message={formError} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Save</Button></div>
        </form>
      </Modal>
    </PageShell>
  );
}
