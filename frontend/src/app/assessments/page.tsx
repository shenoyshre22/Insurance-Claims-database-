"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatAmount, formatDate, todayIso } from "@/lib/client";
import { RECOMMENDATIONS, opts, useLookups } from "@/lib/lookups";
import { Badge, BarChart, Button, Card, DataState, Field, FormError, Input, Modal, Notice, PageShell, SearchBox, Select, SmallButton, StatGrid, Table, Td, Textarea } from "@/components/ui";

interface Assessment {
  assessment_id: number;
  claim_id: number;
  assessor_id: number;
  customer_name: string | null;
  assessor_name: string | null;
  assessment_date: string | null;
  assessed_amount: number | string | null;
  recommendation: string | null;
  remarks: string | null;
  assessor_specialization: string | null;
  claim_status: string | null;
  claimed_amount: string;
}
interface AssessmentsResponse {
  assessments: Assessment[];
  total: number;
  totalAssessors: number;
  recommendations: { value: string | null; count: number }[];
  workload: { assessor_id: number; name: string; assessments: number; avg_approval_pct: string | null }[];
}

const emptyForm = { claim_id: "", assessor_id: "", assessment_date: todayIso(), assessed_amount: "", recommendation: "Approve", remarks: "" };

export default function AssessmentsPage() {
  const { lookups, reload } = useLookups();
  const [search, setSearch] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [data, setData] = useState<AssessmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Assessment | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<AssessmentsResponse>(`/api/assessments?search=${encodeURIComponent(search)}&recommendation=${encodeURIComponent(recommendation)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load assessments.");
    } finally {
      setLoading(false);
    }
  }, [search, recommendation]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  function openForm(a: Assessment | null) {
    setEditing(a);
    setForm(a ? { claim_id: String(a.claim_id), assessor_id: String(a.assessor_id), assessment_date: a.assessment_date ?? todayIso(), assessed_amount: String(a.assessed_amount ?? ""), recommendation: a.recommendation ?? "Approve", remarks: a.remarks ?? "" } : emptyForm);
    setFormError("");
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    try {
      if (editing) await api(`/api/assessments/${editing.assessment_id}`, { method: "PUT", json: form });
      else await api("/api/assessments", { method: "POST", json: form });
      setOpen(false);
      setNotice(editing ? "Assessment updated." : "Assessment recorded and claim status updated.");
      reload();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save assessment.");
    }
  }

  const set = (k: keyof typeof emptyForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const assessable = (lookups?.claims ?? []).filter((c) => c.claim_status !== "Settled");
  const selectedClaim = lookups?.claims.find((c) => String(c.claim_id) === form.claim_id);

  return (
    <PageShell title="Assessments" subtitle="Create, view and update claim assessments." actions={<Button onClick={() => openForm(null)}>New assessment</Button>}>
      <Notice message={notice} onDone={() => setNotice("")} />
      <StatGrid items={[
        { label: "Assessments", value: data?.total ?? "…" },
        { label: "Active assessors", value: data?.totalAssessors ?? "…" },
        ...(data?.recommendations.slice(0, 2).map((r) => ({ label: r.value ?? "None", value: r.count })) ?? []),
      ]} />
      <Card>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <SearchBox value={search} onChange={setSearch} placeholder="Search assessments…" />
          <div className="sm:w-56"><Select aria-label="Recommendation" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} options={(data?.recommendations ?? []).filter((r) => r.value).map((r) => ({ value: r.value!, label: `${r.value} (${r.count})` }))} placeholder="All recommendations" /></div>
        </div>
        <DataState loading={loading && !data} error={error} empty={(data?.assessments.length ?? 0) === 0} emptyText="No assessments found.">
          <Table headers={["ID", "Claim", "Customer", "Assessor", "Date", "Claimed", "Assessed", "Recommendation", "Claim status", "Remarks", ""]}>
            {data?.assessments.map((a) => (
              <tr key={a.assessment_id}>
                <Td>#{a.assessment_id}</Td><Td>#{a.claim_id}</Td><Td>{a.customer_name}</Td>
                <Td>{a.assessor_name}<div className="text-xs text-slate-500">{a.assessor_specialization}</div></Td>
                <Td className="whitespace-nowrap">{formatDate(a.assessment_date)}</Td>
                <Td>{formatAmount(a.claimed_amount)}</Td><Td>{formatAmount(a.assessed_amount)}</Td>
                <Td>{a.recommendation}</Td><Td><Badge value={a.claim_status} /></Td>
                <Td className="max-w-xs">{a.remarks ?? "—"}</Td>
                <Td>{a.claim_status !== "Settled" && <SmallButton onClick={() => openForm(a)}>Edit</SmallButton>}</Td>
              </tr>
            ))}
          </Table>
        </DataState>
      </Card>

      <Card title="Assessor workload">
        <BarChart data={(data?.workload ?? []).map((w) => ({ label: `${w.name}${w.avg_approval_pct ? ` · avg ${w.avg_approval_pct}% of claimed` : ""}`, value: Number(w.assessments) }))} />
      </Card>

      <Modal open={open} title={editing ? `Edit assessment #${editing.assessment_id}` : "New assessment"} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Claim *" hint={selectedClaim ? `Claimed ${formatAmount(selectedClaim.claimed_amount)}` : undefined}>
              <Select required disabled={Boolean(editing)} value={form.claim_id} onChange={set("claim_id")} placeholder="Select claim" options={(editing ? lookups?.claims ?? [] : assessable).map((c) => ({ value: c.claim_id, label: `#${c.claim_id} · ${c.customer_name} · ${c.claim_status}` }))} />
            </Field>
            <Field label="Assessor *"><Select required disabled={Boolean(editing)} value={form.assessor_id} onChange={set("assessor_id")} placeholder="Select assessor" options={(lookups?.assessors ?? []).map((a) => ({ value: a.assessor_id, label: `${a.name}${a.specialization ? ` (${a.specialization})` : ""}` }))} /></Field>
            <Field label="Assessment date"><Input type="date" disabled={Boolean(editing)} value={form.assessment_date} onChange={set("assessment_date")} /></Field>
            <Field label="Assessed amount (₹) *"><Input type="number" min="0" step="0.01" required value={form.assessed_amount} onChange={set("assessed_amount")} /></Field>
            <Field label="Recommendation *"><Select value={form.recommendation} onChange={set("recommendation")} options={opts(RECOMMENDATIONS)} /></Field>
          </div>
          <Field label="Remarks"><Textarea maxLength={500} value={form.remarks} onChange={set("remarks")} /></Field>
          <FormError message={formError} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Save</Button></div>
        </form>
      </Modal>
    </PageShell>
  );
}
