"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, formatAmount, formatDate, todayIso, useCurrentUser } from "@/lib/client";
import { CLAIM_PRIORITIES, CLAIM_STATUSES, opts, useLookups } from "@/lib/lookups";
import { Badge, Button, Card, DataState, Field, FormError, Input, Modal, Notice, PageShell, SearchBox, Select, SmallButton, StatGrid, Table, Td, Textarea } from "@/components/ui";
import ClaimMongoDetails from "@/components/ClaimMongoDetails";

interface Claim {
  claim_id: number;
  customer_name: string;
  policy_id: number;
  policy_name: string;
  incident_type: string;
  incident_date: string;
  incident_location: string | null;
  incident_description: string | null;
  claim_date: string;
  claimed_amount: string | number;
  claim_status: string;
  claim_description: string | null;
  claim_priority: string | null;
  latest_assessed_amount: string | null;
  has_settlement: number;
}
interface ClaimsResponse { claims: Claim[]; total: number; totalClaimedAmount: number; statuses: { value: string; count: number }[] }
interface ClaimDetail {
  claim: Claim & { coverage_amount: string; policy_status: string };
  assessments: { assessment_id: number; assessor_name: string; assessment_date: string; assessed_amount: string; recommendation: string; remarks: string | null }[];
  settlement: { settlement_id: number; settlement_amount: string; settlement_status: string; settlement_date?: string } | null;
  payments: { payment_id: number; payment_amount: string; payment_date?: string; payment_method?: string }[];
  settlementPercentage: number | null;
  nosql: { evidence: number; investigations: number; activities: number; communications: number };
}

const emptyClaim = { policy_id: "", incident_type: "", incident_date: "", location: "", incident_description: "", claim_date: todayIso(), claimed_amount: "", claim_description: "", claim_priority: "Medium" };

export default function ClaimsPage() {
  const user = useCurrentUser();
  const { lookups, reload: reloadLookups } = useLookups();
  const [filters, setFilters] = useState({ search: "", status: "", priority: "", from: "", to: "" });
  const [data, setData] = useState<ClaimsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [form, setForm] = useState(emptyClaim);
  const [formError, setFormError] = useState("");
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [updateFor, setUpdateFor] = useState<Claim | null>(null);
  const [update, setUpdate] = useState({ claim_status: "", claim_priority: "", claim_description: "" });
  const [updateError, setUpdateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams(filters).toString();
      setData(await api<ClaimsResponse>(`/api/claims?${qs}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load claims.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  const setFilter = (k: keyof typeof filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const setField = (k: keyof typeof emptyClaim) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function register(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    try {
      const res = await api<{ claim_id: number }>("/api/claims", { method: "POST", json: form });
      setRegisterOpen(false);
      setForm(emptyClaim);
      setNotice(`Claim #${res.claim_id} registered.`);
      reloadLookups();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to register claim.");
    }
  }

  async function view(claim: Claim) {
    try {
      setDetail(await api<ClaimDetail>(`/api/claims/${claim.claim_id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load claim.");
    }
  }

  function openUpdate(claim: Claim) {
    setUpdateFor(claim);
    setUpdate({ claim_status: claim.claim_status, claim_priority: claim.claim_priority ?? "Medium", claim_description: claim.claim_description ?? "" });
    setUpdateError("");
  }

  async function saveUpdate(event: FormEvent) {
    event.preventDefault();
    if (!updateFor) return;
    setUpdateError("");
    try {
      await api(`/api/claims/${updateFor.claim_id}`, { method: "PUT", json: update });
      setUpdateFor(null);
      setNotice(`Claim #${updateFor.claim_id} updated.`);
      await load();
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : "Unable to update claim.");
    }
  }

  async function remove(claim: Claim) {
    if (!window.confirm(`Delete claim #${claim.claim_id}?`)) return;
    try {
      await api(`/api/claims/${claim.claim_id}`, { method: "DELETE" });
      setNotice("Claim deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete claim.");
    }
  }

  const activePolicies = (lookups?.policies ?? []).filter((p) => p.policy_status === "Active");
  const selectedPolicy = activePolicies.find((p) => String(p.policy_id) === form.policy_id);

  return (
    <PageShell title="Claims" subtitle="Register, view, update and filter insurance claims." actions={<Button onClick={() => { setFormError(""); setRegisterOpen(true); }}>Register claim</Button>}>
      <Notice message={notice} onDone={() => setNotice("")} />
      <StatGrid items={[
        { label: "Total claims", value: data?.total ?? "…" },
        { label: "Total claimed", value: data ? formatAmount(data.totalClaimedAmount) : "…" },
        ...(data?.statuses.slice(0, 2).map((s) => ({ label: s.value, value: s.count })) ?? []),
      ]} />
      <Card>
        <div className="mb-6 grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2"><SearchBox value={filters.search} onChange={setFilter("search")} placeholder="Search claims…" /></div>
          <Select aria-label="Status" value={filters.status} onChange={(e) => setFilter("status")(e.target.value)} options={(data?.statuses ?? []).map((s) => ({ value: s.value, label: `${s.value} (${s.count})` }))} placeholder="All statuses" />
          <Select aria-label="Priority" value={filters.priority} onChange={(e) => setFilter("priority")(e.target.value)} options={opts(CLAIM_PRIORITIES)} placeholder="All priorities" />
          <div className="flex gap-2">
            <Input aria-label="From date" type="date" value={filters.from} onChange={(e) => setFilter("from")(e.target.value)} />
            <Input aria-label="To date" type="date" value={filters.to} onChange={(e) => setFilter("to")(e.target.value)} />
          </div>
        </div>
        <DataState loading={loading && !data} error={error} empty={(data?.claims.length ?? 0) === 0} emptyText="No claims match these filters.">
          <Table headers={["Claim", "Customer", "Policy", "Incident", "Claim date", "Claimed", "Assessed", "Priority", "Status", "Actions"]}>
            {data?.claims.map((c) => (
              <tr key={c.claim_id}>
                <Td>#{c.claim_id}</Td>
                <Td>{c.customer_name}</Td>
                <Td>#{c.policy_id}<div className="text-xs text-slate-500">{c.policy_name}</div></Td>
                <Td>{c.incident_type}<div className="text-xs text-slate-500">{formatDate(c.incident_date)}{c.incident_location ? ` · ${c.incident_location}` : ""}</div></Td>
                <Td className="whitespace-nowrap">{formatDate(c.claim_date)}</Td>
                <Td>{formatAmount(c.claimed_amount)}</Td>
                <Td>{formatAmount(c.latest_assessed_amount)}</Td>
                <Td><Badge value={c.claim_priority} /></Td>
                <Td><Badge value={c.claim_status} /></Td>
                <Td className="whitespace-nowrap">
                  <SmallButton onClick={() => view(c)}>View</SmallButton>
                  {c.claim_status !== "Settled" && <SmallButton onClick={() => openUpdate(c)}>Update</SmallButton>}
                  {user?.role === "Admin" && <SmallButton className="text-red-700" onClick={() => remove(c)}>Delete</SmallButton>}
                </Td>
              </tr>
            ))}
          </Table>
        </DataState>
      </Card>

      <Modal open={registerOpen} title="Register claim" onClose={() => setRegisterOpen(false)} wide>
        <form onSubmit={register} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Policy (active only) *" hint={selectedPolicy ? `Coverage ${formatAmount(selectedPolicy.coverage_amount)} · ${formatDate(selectedPolicy.start_date)} – ${formatDate(selectedPolicy.end_date)}` : undefined}>
              <Select required value={form.policy_id} onChange={setField("policy_id")} placeholder="Select policy" options={activePolicies.map((p) => ({ value: p.policy_id, label: `#${p.policy_id} · ${p.customer_name} · ${p.policy_name}` }))} />
            </Field>
            <Field label="Priority"><Select value={form.claim_priority} onChange={setField("claim_priority")} options={opts(CLAIM_PRIORITIES)} /></Field>
            <Field label="Incident type *"><Input required maxLength={50} value={form.incident_type} onChange={setField("incident_type")} placeholder="e.g. Collision, Theft, Hospitalisation" /></Field>
            <Field label="Incident date *"><Input type="date" required max={todayIso()} value={form.incident_date} onChange={setField("incident_date")} /></Field>
            <Field label="Location"><Input maxLength={150} value={form.location} onChange={setField("location")} /></Field>
            <Field label="Claim date"><Input type="date" value={form.claim_date} onChange={setField("claim_date")} /></Field>
            <Field label="Claimed amount (₹) *"><Input type="number" min="0.01" step="0.01" required value={form.claimed_amount} onChange={setField("claimed_amount")} /></Field>
          </div>
          <Field label="Incident description"><Textarea maxLength={500} value={form.incident_description} onChange={setField("incident_description")} /></Field>
          <Field label="Claim description"><Textarea maxLength={500} value={form.claim_description} onChange={setField("claim_description")} /></Field>
          <FormError message={formError} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRegisterOpen(false)}>Cancel</Button><Button type="submit">Register</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(updateFor)} title={`Update claim #${updateFor?.claim_id ?? ""}`} onClose={() => setUpdateFor(null)}>
        <form onSubmit={saveUpdate} className="space-y-4">
          <Field label="Status" hint="Settled is set automatically when a settlement is created.">
            <Select value={update.claim_status} onChange={(e) => setUpdate((u) => ({ ...u, claim_status: e.target.value }))} options={opts(CLAIM_STATUSES.filter((s) => s !== "Settled"))} />
          </Field>
          <Field label="Priority"><Select value={update.claim_priority} onChange={(e) => setUpdate((u) => ({ ...u, claim_priority: e.target.value }))} options={opts(CLAIM_PRIORITIES)} /></Field>
          <Field label="Description"><Textarea maxLength={500} value={update.claim_description} onChange={(e) => setUpdate((u) => ({ ...u, claim_description: e.target.value }))} /></Field>
          <FormError message={updateError} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setUpdateFor(null)}>Cancel</Button><Button type="submit">Save</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(detail)} title={`Claim #${detail?.claim.claim_id ?? ""}`} onClose={() => setDetail(null)} wide>
        {detail && (
          <div className="space-y-5 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <Info label="Customer" value={detail.claim.customer_name} />
              <Info label="Policy" value={`#${detail.claim.policy_id} · ${detail.claim.policy_name}`} />
              <Info label="Coverage" value={formatAmount(detail.claim.coverage_amount)} />
              <Info label="Incident" value={`${detail.claim.incident_type} on ${formatDate(detail.claim.incident_date)}`} />
              <Info label="Claimed" value={formatAmount(detail.claim.claimed_amount)} />
              <Info label="Status" value={<Badge value={detail.claim.claim_status} />} />
              <Info label="Settlement %" value={detail.settlementPercentage == null ? "—" : `${detail.settlementPercentage}%`} />
              <Info label="Priority" value={<Badge value={detail.claim.claim_priority} />} />
            </div>
            {detail.claim.claim_description && <p className="text-slate-700">{detail.claim.claim_description}</p>}
            <div>
              <h4 className="mb-2 font-semibold text-slate-900">Assessments</h4>
              {detail.assessments.length === 0 ? <p className="text-slate-500">Not assessed yet.</p> : (
                <Table headers={["ID", "Assessor", "Date", "Assessed", "Recommendation"]}>
                  {detail.assessments.map((a) => <tr key={a.assessment_id}><Td>#{a.assessment_id}</Td><Td>{a.assessor_name}</Td><Td>{formatDate(a.assessment_date)}</Td><Td>{formatAmount(a.assessed_amount)}</Td><Td>{a.recommendation}</Td></tr>)}
                </Table>
              )}
            </div>
            <div>
              <h4 className="mb-2 font-semibold text-slate-900">Settlement & payments</h4>
              {detail.settlement ? (
                <p>Settlement #{detail.settlement.settlement_id}: {formatAmount(detail.settlement.settlement_amount)} <Badge value={detail.settlement.settlement_status} /> · Paid {formatAmount(detail.payments.reduce((s, p) => s + Number(p.payment_amount), 0))} in {detail.payments.length} payment(s)</p>
              ) : <p className="text-slate-500">No settlement yet.</p>}
            </div>
            <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
              <Link className="text-blue-700 hover:underline" href={`/evidence?claim_id=${detail.claim.claim_id}`}>Evidence ({detail.nosql.evidence})</Link>
              <Link className="text-blue-700 hover:underline" href={`/investigations?claim_id=${detail.claim.claim_id}`}>Investigations ({detail.nosql.investigations})</Link>
              <Link className="text-blue-700 hover:underline" href={`/activity?claim_id=${detail.claim.claim_id}`}>Activity timeline ({detail.nosql.activities})</Link>
              <Link className="text-blue-700 hover:underline" href={`/communications?claim_id=${detail.claim.claim_id}`}>Communications ({detail.nosql.communications})</Link>
            </div>
            <ClaimMongoDetails claimId={detail.claim.claim_id} />
          </div>
        )}
      </Modal>
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-xs uppercase text-slate-500">{label}</p><div className="text-slate-900">{value}</div></div>;
}
