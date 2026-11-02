"use client";

import { useState, type FormEvent } from "react";
import { api, useCurrentUser } from "@/lib/client";
import { Button, Card, Field, FormError, Input, Notice, PageShell, Select, Textarea } from "@/components/ui";

const evidenceTypes = ["Photograph", "Police Report", "Medical Report", "Invoice", "Repair Estimate", "Witness Statement", "Other"];

export default function SubmitDocumentsPage() {
  const user = useCurrentUser();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) throw new Error("Choose a supporting document to upload.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Files must be 5 MB or smaller.");
      await api("/api/evidence", { method: "POST", body: form });
      event.currentTarget.reset();
      setNotice("Your supporting document was submitted for administrator review.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit document.");
    } finally { setBusy(false); }
  }

  return <PageShell title="Submit supporting document" subtitle={`Signed in as ${user?.full_name ?? "user"}. Your submission will be reviewed by an administrator.`}>
    <Notice message={notice} onDone={() => setNotice("")} />
    <Card title="Document submission">
      <form onSubmit={submit} className="max-w-2xl space-y-4">
        <Field label="Claim ID *" hint="Enter the claim number supplied to you by the insurer."><Input name="claim_id" type="number" min="1" required /></Field>
        <Field label="Document type *"><Select name="evidence_type" required options={evidenceTypes.map((type) => ({ value: type, label: type }))} placeholder="Select document type" /></Field>
        <Field label="Description *"><Textarea name="description" required maxLength={1000} placeholder="Briefly describe this document." /></Field>
        <Field label="Tags" hint="Optional, comma separated"><Input name="tags" maxLength={300} placeholder="e.g. accident, invoice" /></Field>
        <Field label="File *" hint="PDF, PNG, JPEG or WEBP · maximum 5 MB"><Input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp" /></Field>
        <FormError message={error} />
        <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit document"}</Button>
      </form>
    </Card>
  </PageShell>;
}
