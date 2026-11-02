"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatDate, formatDateTime, useCurrentUser } from "@/lib/client";
import { EVIDENCE_STATUSES, opts, useLookups } from "@/lib/lookups";
import { Badge, BarChart, Button, Card, DataState, Field, FormError, Input, Modal, Notice, PageShell, Select, SmallButton, StatGrid, Table, Td, Textarea } from "@/components/ui";

interface Evidence {
  _id: string;
  claim_id: number;
  evidence_type: string;
  description: string;
  tags: string[];
  file: { original_name: string; mime_type: string; size: number } | null;
  metadata: { source: string | null; captured_at: string | null };
  verification_status: string;
  verification: { verified_by: { name: string }; verified_at: string; notes: string | null } | null;
  uploaded_by: { name: string };
  uploaded_at: string;
}
interface EvidenceResponse {
  evidence: Evidence[];
  evidenceTypes: string[];
  summary: { byStatus: { _id: string; count: number }[]; byType: { _id: string; count: number }[]; totals: { documents: number; bytes: number; claims: number }[] };
}

export default function EvidencePage() {
  return (
    <Suspense>
      <EvidencePageContent />
    </Suspense>
  );
}

function EvidencePageContent() {
  const searchParams = useSearchParams();
  const user = useCurrentUser();
  const { lookups } = useLookups();
  const [filters, setFilters] = useState({ claim_id: searchParams.get("claim_id") ?? "", status: "", search: "" });
  const [data, setData] = useState<EvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifyFor, setVerifyFor] = useState<Evidence | null>(null);
  const [verify, setVerify] = useState({ verification_status: "Verified", notes: "" });


  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<EvidenceResponse>(`/api/evidence?${new URLSearchParams(filters)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load evidence.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const formData = new FormData(event.currentTarget);
      const file = formData.get("file");
      if (file instanceof File && file.size > 5 * 1024 * 1024) throw new Error("Files must be 5 MB or smaller.");
      await api("/api/evidence", { method: "POST", body: formData });
      setOpen(false);
      setNotice("Evidence uploaded.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to upload evidence.");
    } finally {
      setBusy(false);
    }
  }

  async function saveVerification(event: FormEvent) {
    event.preventDefault();
    if (!verifyFor) return;
    try {
      await api(`/api/evidence/${verifyFor._id}`, { method: "PATCH", json: verify });
      setVerifyFor(null);
      setNotice("Verification status updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update evidence.");
    }
  }

  async function remove(e: Evidence) {
    if (!window.confirm("Delete this evidence and its file?")) return;
    try {
      await api(`/api/evidence/${e._id}`, { method: "DELETE" });
      setNotice("Evidence deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete evidence.");
    }
  }

  const totals = data?.summary.totals[0];

  return (
    <PageShell title="Supporting Documents" subtitle="Upload and verify claim documents in MongoDB/GridFS." actions={<Button onClick={() => { setFormError(""); setOpen(true); }}>Upload document</Button>}>
      <Notice message={notice} onDone={() => setNotice("")} />
      <StatGrid items={[
        { label: "Evidence items", value: totals?.documents ?? (data ? 0 : "…") },
        { label: "Claims with evidence", value: totals?.claims ?? (data ? 0 : "…") },
        { label: "Pending verification", value: data?.summary.byStatus.find((s) => s._id === "Pending")?.count ?? (data ? 0 : "…") },
        { label: "Stored files", value: totals ? `${(totals.bytes / 1024 / 1024).toFixed(2)} MB` : data ? "0 MB" : "…" },
      ]} />
      <Card>
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Input aria-label="Claim ID" type="number" min="1" placeholder="Filter by claim ID" value={filters.claim_id} onChange={(e) => setFilters((f) => ({ ...f, claim_id: e.target.value }))} />
          <Select aria-label="Verification status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} options={opts(EVIDENCE_STATUSES)} placeholder="All statuses" />
          <Input type="search" aria-label="Search descriptions" placeholder="Search descriptions and tags…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <DataState loading={loading && !data} error={error} empty={(data?.evidence.length ?? 0) === 0} emptyText="No evidence found.">
          <Table headers={["Claim", "Type", "Description", "File", "Uploaded", "Status", "Actions"]}>
            {data?.evidence.map((e) => (
              <tr key={e._id}>
                <Td>#{e.claim_id}</Td>
                <Td>{e.evidence_type}</Td>
                <Td className="max-w-sm">
                  {e.description}
                  {e.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{e.tags.map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">{t}</span>)}</div>}
                  {(e.metadata.source || e.metadata.captured_at) && <div className="mt-1 text-xs text-slate-500">{[e.metadata.source, e.metadata.captured_at && `captured ${formatDate(e.metadata.captured_at)}`].filter(Boolean).join(" · ")}</div>}
                </Td>
                <Td>{e.file ? <a className="text-blue-700 hover:underline" href={`/api/evidence/${e._id}/file`} target="_blank" rel="noopener noreferrer">{e.file.original_name}</a> : "—"}{e.file && <div className="text-xs text-slate-500">{(e.file.size / 1024).toFixed(0)} KB</div>}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(e.uploaded_at)}<div className="text-xs text-slate-500">{e.uploaded_by.name}</div></Td>
                <Td><Badge value={e.verification_status} />{e.verification && <div className="mt-1 text-xs text-slate-500">by {e.verification.verified_by.name}{e.verification.notes ? `: ${e.verification.notes}` : ""}</div>}</Td>
                <Td className="whitespace-nowrap">
                  <SmallButton onClick={() => { setVerifyFor(e); setVerify({ verification_status: e.verification_status === "Pending" ? "Verified" : e.verification_status, notes: "" }); }}>Verify</SmallButton>
                  {user?.role === "Admin" && <SmallButton className="text-red-700" onClick={() => remove(e)}>Delete</SmallButton>}
                </Td>
              </tr>
            ))}
          </Table>
        </DataState>
      </Card>
      <Card title="Evidence by type (aggregation)">
        <BarChart data={(data?.summary.byType ?? []).map((t) => ({ label: t._id, value: t.count }))} />
      </Card>

      <Modal open={open} title="Upload supporting document" onClose={() => setOpen(false)}>
        <form onSubmit={upload} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Claim *"><Select name="claim_id" required defaultValue={filters.claim_id} placeholder="Select claim" options={(lookups?.claims ?? []).map((c) => ({ value: c.claim_id, label: `#${c.claim_id} · ${c.customer_name}` }))} /></Field>
            <Field label="Evidence type *"><Select name="evidence_type" required options={opts(data?.evidenceTypes ?? [])} placeholder="Select type" /></Field>
            <Field label="Source"><Input name="source" maxLength={100} placeholder="e.g. Police station, garage" /></Field>
            <Field label="Captured on"><Input name="captured_at" type="date" /></Field>
          </div>
          <Field label="Description *"><Textarea name="description" required maxLength={1000} /></Field>
          <Field label="Tags" hint="Comma separated"><Input name="tags" maxLength={300} /></Field>
          <Field label="File" hint="PDF, PNG, JPEG or WEBP · max 5 MB"><Input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" /></Field>
          <FormError message={formError} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload"}</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(verifyFor)} title="Verify evidence" onClose={() => setVerifyFor(null)}>
        <form onSubmit={saveVerification} className="space-y-4">
          <Field label="Verification status"><Select value={verify.verification_status} onChange={(e) => setVerify((v) => ({ ...v, verification_status: e.target.value }))} options={opts(EVIDENCE_STATUSES)} /></Field>
          <Field label="Notes"><Textarea maxLength={500} value={verify.notes} onChange={(e) => setVerify((v) => ({ ...v, notes: e.target.value }))} /></Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setVerifyFor(null)}>Cancel</Button><Button type="submit">Save</Button></div>
        </form>
      </Modal>
    </PageShell>
  );
}
