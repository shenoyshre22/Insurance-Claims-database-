"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatAmount, formatDateTime, useCurrentUser } from "@/lib/client";
import { INVESTIGATION_RECOMMENDATIONS, INVESTIGATION_STATUSES, RISK_LEVELS, opts, useLookups } from "@/lib/lookups";
import { Badge, BarChart, Button, Card, DataState, Field, FormError, Input, Modal, Notice, PageShell, Select, SmallButton, Table, Td, Textarea } from "@/components/ui";

interface Investigation {
  _id: string;
  claim_id: number;
  investigator: string;
  status: string;
  risk_level: string;
  risk_score: number;
  summary: string;
  findings: { finding: string; recorded_at: string; recorded_by: string }[];
  observations: string[];
  fraud_indicators: string[];
  tags: string[];
  recommendation: string;
  updated_at: string;
}
interface InvestigationsResponse {
  records: Investigation[];
  byRisk: { _id: string; count: number; avg_score: number; open: number }[];
  byRecommendation: { _id: string; count: number }[];
  highRisk: { _id: number; max_score: number; findings: number; investigations: number; claim: { claimed_amount: string; claim_status: string; customer_name: string } | null }[];
}

const emptyForm = { claim_id: "", investigator: "", status: "Open", risk_level: "Medium", risk_score: "50", summary: "", findings: "", observations: "", fraud_indicators: "", tags: "", recommendation: "Further Investigation" };

export default function InvestigationsPage() {
  return (
    <Suspense>
      <InvestigationsPageContent />
    </Suspense>
  );
}

function InvestigationsPageContent() {
  const searchParams = useSearchParams();
  const user = useCurrentUser();
  const { lookups } = useLookups();
  const [filters, setFilters] = useState({ claim_id: searchParams.get("claim_id") ?? "", risk_level: "", status: "" });
  const [data, setData] = useState<InvestigationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<Investigation | null>(null);
  const [edit, setEdit] = useState({ status: "", risk_level: "", risk_score: "", recommendation: "", new_findings: "", observations: "", tags: "" });
  const [editError, setEditError] = useState("");


  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<InvestigationsResponse>(`/api/investigations?${new URLSearchParams(filters)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load investigations.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  const set = (k: keyof typeof emptyForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    try {
      await api("/api/investigations", { method: "POST", json: form });
      setOpen(false);
      setForm(emptyForm);
      setNotice("Investigation recorded.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save investigation.");
    }
  }

  function openEdit(r: Investigation) {
    setEditing(r);
    setEdit({ status: r.status, risk_level: r.risk_level, risk_score: String(r.risk_score), recommendation: r.recommendation, new_findings: "", observations: r.observations.join("\n"), tags: (r.tags ?? []).join("\n") });
    setEditError("");
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setEditError("");
    try {
      await api(`/api/investigations/${editing._id}`, { method: "PUT", json: edit });
      setEditing(null);
      setNotice("Investigation updated.");
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Unable to update investigation.");
    }
  }

  async function remove(r: Investigation) {
    if (!window.confirm("Delete this investigation record?")) return;
    try {
      await api(`/api/investigations/${r._id}`, { method: "DELETE" });
      setNotice("Investigation deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete investigation.");
    }
  }

  return (
    <PageShell title="Investigations" subtitle="Record findings, risk levels and recommendations (stored in MongoDB)." actions={<Button onClick={() => { setForm({ ...emptyForm, claim_id: filters.claim_id }); setFormError(""); setOpen(true); }}>New investigation</Button>}>
      <Notice message={notice} onDone={() => setNotice("")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="By risk level">
          <BarChart data={(data?.byRisk ?? []).map((r) => ({ label: `${r._id} · avg score ${Math.round(r.avg_score)} · ${r.open} open`, value: r.count }))} />
        </Card>
        <Card title="By recommendation">
          <BarChart data={(data?.byRecommendation ?? []).map((r) => ({ label: r._id, value: r.count }))} />
        </Card>
        <Card title="Highest-risk open claims">
          {(data?.highRisk.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No high-risk open investigations.</p> : (
            <ul className="space-y-2 text-sm">
              {data?.highRisk.map((h) => (
                <li key={h._id} className="flex justify-between gap-2">
                  <span>#{h._id} {h.claim ? `· ${h.claim.customer_name} · ${formatAmount(h.claim.claimed_amount)}` : ""}</span>
                  <span className="font-semibold text-red-700">{h.max_score}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Input aria-label="Claim ID" type="number" min="1" placeholder="Filter by claim ID" value={filters.claim_id} onChange={(e) => setFilters((f) => ({ ...f, claim_id: e.target.value }))} />
          <Select aria-label="Risk level" value={filters.risk_level} onChange={(e) => setFilters((f) => ({ ...f, risk_level: e.target.value }))} options={opts(RISK_LEVELS)} placeholder="All risk levels" />
          <Select aria-label="Status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} options={opts(INVESTIGATION_STATUSES)} placeholder="All statuses" />
        </div>
        <DataState loading={loading && !data} error={error} empty={(data?.records.length ?? 0) === 0} emptyText="No investigations found.">
          <Table headers={["Claim", "Investigator", "Risk", "Findings", "Fraud indicators", "Recommendation", "Status", "Updated", ""]}>
            {data?.records.map((r) => (
              <tr key={r._id}>
                <Td>#{r.claim_id}</Td>
                <Td>{r.investigator}</Td>
                <Td><Badge value={r.risk_level} /><div className="text-xs text-slate-500">score {r.risk_score}</div></Td>
                <Td className="max-w-sm">
                  <p className="mb-1 text-slate-900">{r.summary}</p>
                  <ul className="list-disc pl-4 text-xs text-slate-600">{r.findings.map((f, i) => <li key={i}>{f.finding}</li>)}</ul>
                  {r.tags?.length > 0 && <p className="mt-1 text-xs text-slate-500">Tags: {r.tags.join(", ")}</p>}
                </Td>
                <Td className="text-xs">{r.fraud_indicators.length ? r.fraud_indicators.join(", ") : "—"}</Td>
                <Td>{r.recommendation}</Td>
                <Td><Badge value={r.status} /></Td>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(r.updated_at)}</Td>
                <Td className="whitespace-nowrap">
                  <SmallButton onClick={() => openEdit(r)}>Update</SmallButton>
                  {user?.role === "Admin" && <SmallButton className="text-red-700" onClick={() => remove(r)}>Delete</SmallButton>}
                </Td>
              </tr>
            ))}
          </Table>
        </DataState>
      </Card>

      <Modal open={open} title="New investigation" onClose={() => setOpen(false)} wide>
        <form onSubmit={create} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Claim *"><Select required value={form.claim_id} onChange={set("claim_id")} placeholder="Select claim" options={(lookups?.claims ?? []).map((c) => ({ value: c.claim_id, label: `#${c.claim_id} · ${c.customer_name}` }))} /></Field>
            <Field label="Investigator"><Input maxLength={100} value={form.investigator} onChange={set("investigator")} placeholder={user?.full_name} /></Field>
            <Field label="Status"><Select value={form.status} onChange={set("status")} options={opts(INVESTIGATION_STATUSES)} /></Field>
            <Field label="Risk level *"><Select value={form.risk_level} onChange={set("risk_level")} options={opts(RISK_LEVELS)} /></Field>
            <Field label="Risk score (0–100) *"><Input type="number" min="0" max="100" required value={form.risk_score} onChange={set("risk_score")} /></Field>
            <Field label="Recommendation *"><Select value={form.recommendation} onChange={set("recommendation")} options={opts(INVESTIGATION_RECOMMENDATIONS)} /></Field>
          </div>
          <Field label="Summary *"><Textarea required maxLength={2000} value={form.summary} onChange={set("summary")} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Findings * (one per line)"><Textarea rows={4} required value={form.findings} onChange={set("findings")} /></Field>
            <Field label="Observations (one per line)"><Textarea rows={4} value={form.observations} onChange={set("observations")} /></Field>
            <Field label="Fraud indicators (one per line)"><Textarea rows={4} value={form.fraud_indicators} onChange={set("fraud_indicators")} /></Field>
          </div>
          <Field label="Tags (one per line)"><Textarea rows={2} value={form.tags} onChange={set("tags")} /></Field>
          <FormError message={formError} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Save</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(editing)} title={`Update investigation · claim #${editing?.claim_id ?? ""}`} onClose={() => setEditing(null)}>
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status"><Select value={edit.status} onChange={(e) => setEdit((x) => ({ ...x, status: e.target.value }))} options={opts(INVESTIGATION_STATUSES)} /></Field>
            <Field label="Risk level"><Select value={edit.risk_level} onChange={(e) => setEdit((x) => ({ ...x, risk_level: e.target.value }))} options={opts(RISK_LEVELS)} /></Field>
            <Field label="Risk score"><Input type="number" min="0" max="100" value={edit.risk_score} onChange={(e) => setEdit((x) => ({ ...x, risk_score: e.target.value }))} /></Field>
            <Field label="Recommendation"><Select value={edit.recommendation} onChange={(e) => setEdit((x) => ({ ...x, recommendation: e.target.value }))} options={opts(INVESTIGATION_RECOMMENDATIONS)} /></Field>
          </div>
          <Field label="Add findings (one per line)" hint="Appended to the existing findings."><Textarea value={edit.new_findings} onChange={(e) => setEdit((x) => ({ ...x, new_findings: e.target.value }))} /></Field>
          <Field label="Observations (one per line)"><Textarea value={edit.observations} onChange={(e) => setEdit((x) => ({ ...x, observations: e.target.value }))} /></Field>
          <Field label="Tags (one per line)"><Textarea value={edit.tags} onChange={(e) => setEdit((x) => ({ ...x, tags: e.target.value }))} /></Field>
          <FormError message={editError} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit">Save</Button></div>
        </form>
      </Modal>
    </PageShell>
  );
}
