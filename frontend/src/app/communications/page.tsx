"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatDateTime, useCurrentUser } from "@/lib/client";
import { Button, Card, DataState, Field, FormError, Input, Modal, Notice, PageShell, Select, SmallButton, Table, Td, Textarea } from "@/components/ui";
import { useLookups } from "@/lib/lookups";

interface Communication { _id: string; claim_id: number; communication_type: string; subject: string; message: string; sender: string; timestamp: string; }
interface CommunicationResponse { communications: Communication[]; communicationTypes: string[]; }
const emptyForm = { claim_id: "", communication_type: "Email", subject: "", message: "", sender: "" };

export default function CommunicationsPage() {
  return <Suspense><CommunicationsContent /></Suspense>;
}

function CommunicationsContent() {
  const searchParams = useSearchParams();
  const user = useCurrentUser();
  const { lookups } = useLookups();
  const [filters, setFilters] = useState({ claim_id: searchParams.get("claim_id") ?? "", communication_type: "", search: "" });
  const [data, setData] = useState<CommunicationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<Communication | null>(null);
  const [editError, setEditError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api<CommunicationResponse>(`/api/communications?${new URLSearchParams(filters)}`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load communications."); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [load]);
  const set = (key: keyof typeof emptyForm) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function create(event: FormEvent) {
    event.preventDefault(); setFormError("");
    try { await api("/api/communications", { method: "POST", json: form }); setOpen(false); setForm(emptyForm); setNotice("Communication recorded."); await load(); }
    catch (err) { setFormError(err instanceof Error ? err.message : "Unable to record communication."); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing) return; setEditError("");
    try { await api(`/api/communications/${editing._id}`, { method: "PUT", json: editing }); setEditing(null); setNotice("Communication updated."); await load(); }
    catch (err) { setEditError(err instanceof Error ? err.message : "Unable to update communication."); }
  }
  async function remove(record: Communication) {
    if (!window.confirm("Delete this communication record?")) return;
    try { await api(`/api/communications/${record._id}`, { method: "DELETE" }); setNotice("Communication deleted."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to delete communication."); }
  }
  const types = data?.communicationTypes ?? [];

  return <PageShell title="Claim Communications" subtitle="Record customer and stakeholder communications in MongoDB." actions={<Button onClick={() => { setForm({ ...emptyForm, claim_id: filters.claim_id, sender: user?.full_name ?? "" }); setFormError(""); setOpen(true); }}>Record communication</Button>}>
    <Notice message={notice} onDone={() => setNotice("")} />
    <Card>
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Input aria-label="Claim ID" type="number" min="1" placeholder="Filter by claim ID" value={filters.claim_id} onChange={(e) => setFilters((f) => ({ ...f, claim_id: e.target.value }))} />
        <Select aria-label="Communication type" value={filters.communication_type} onChange={(e) => setFilters((f) => ({ ...f, communication_type: e.target.value }))} options={types.map((type) => ({ value: type, label: type }))} placeholder="All types" />
        <Input aria-label="Search communications" type="search" placeholder="Search subject, message or sender…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
      </div>
      <DataState loading={loading && !data} error={error} empty={(data?.communications.length ?? 0) === 0} emptyText="No communications found.">
        <Table headers={["Claim", "Type", "Subject & message", "Sender", "Recorded", "Actions"]}>{data?.communications.map((record) => <tr key={record._id}>
          <Td>#{record.claim_id}</Td><Td>{record.communication_type}</Td><Td className="max-w-md"><p className="font-medium text-slate-900">{record.subject}</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{record.message}</p></Td><Td>{record.sender}</Td><Td className="whitespace-nowrap text-xs">{formatDateTime(record.timestamp)}</Td>
          <Td className="whitespace-nowrap"><SmallButton onClick={() => { setEditing({ ...record }); setEditError(""); }}>Edit</SmallButton>{user?.role === "Admin" && <SmallButton className="text-red-700" onClick={() => void remove(record)}>Delete</SmallButton>}</Td>
        </tr>)}</Table>
      </DataState>
    </Card>
    <Modal open={open} title="Record communication" onClose={() => setOpen(false)}><form onSubmit={create} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Claim *"><Select required value={form.claim_id} onChange={set("claim_id")} placeholder="Select claim" options={(lookups?.claims ?? []).map((claim) => ({ value: claim.claim_id, label: `#${claim.claim_id} · ${claim.customer_name}` }))} /></Field><Field label="Type *"><Select value={form.communication_type} onChange={set("communication_type")} options={types.map((type) => ({ value: type, label: type }))} /></Field><Field label="Sender"><Input maxLength={100} value={form.sender} onChange={set("sender")} /></Field><Field label="Subject *"><Input required maxLength={200} value={form.subject} onChange={set("subject")} /></Field></div><Field label="Message *"><Textarea required maxLength={4000} value={form.message} onChange={set("message")} /></Field><FormError message={formError} /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Save</Button></div>
    </form></Modal>
    <Modal open={Boolean(editing)} title={`Edit communication · claim #${editing?.claim_id ?? ""}`} onClose={() => setEditing(null)}><form onSubmit={save} className="space-y-4">
      <Field label="Type"><Select value={editing?.communication_type ?? ""} onChange={(e) => setEditing((r) => r && { ...r, communication_type: e.target.value })} options={types.map((type) => ({ value: type, label: type }))} /></Field><Field label="Sender"><Input maxLength={100} value={editing?.sender ?? ""} onChange={(e) => setEditing((r) => r && { ...r, sender: e.target.value })} /></Field><Field label="Subject"><Input required maxLength={200} value={editing?.subject ?? ""} onChange={(e) => setEditing((r) => r && { ...r, subject: e.target.value })} /></Field><Field label="Message"><Textarea required maxLength={4000} value={editing?.message ?? ""} onChange={(e) => setEditing((r) => r && { ...r, message: e.target.value })} /></Field><FormError message={editError} /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit">Save</Button></div>
    </form></Modal>
  </PageShell>;
}
