"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatDateTime } from "@/lib/client";
import { opts } from "@/lib/lookups";
import { Badge, Button, Card, DataState, Field, FormError, Input, Modal, Notice, PageShell, Select, SmallButton, Table, Td } from "@/components/ui";

interface User { user_id: number; full_name: string; email: string; role: string; is_active: number; created_at: string; last_login_at: string | null }
const emptyForm = { full_name: "", email: "", role: "Claims Officer", password: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: User[] }>("/api/users")).users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users.");
    }
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    try {
      await api("/api/users", { method: "POST", json: form });
      setOpen(false);
      setForm(emptyForm);
      setNotice("User created.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to create user.");
    }
  }

  async function toggle(u: User) {
    try {
      await api("/api/users", { method: "PATCH", json: { user_id: u.user_id, is_active: !u.is_active } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update user.");
    }
  }

  return (
    <PageShell title="Users" subtitle="Manage Admin and Claims Officer accounts." actions={<Button onClick={() => { setFormError(""); setOpen(true); }}>Add user</Button>}>
      <Notice message={notice} onDone={() => setNotice("")} />
      <Card>
        <DataState loading={!users && !error} error={error} empty={users?.length === 0} emptyText="No users.">
          <Table headers={["Name", "Email", "Role", "Status", "Last login", ""]}>
            {users?.map((u) => (
              <tr key={u.user_id}>
                <Td>{u.full_name}</Td><Td>{u.email}</Td><Td>{u.role}</Td><Td><Badge value={u.is_active ? "Active" : "Suspended"} /></Td>
                <Td>{formatDateTime(u.last_login_at)}</Td>
                <Td><SmallButton onClick={() => toggle(u)}>{u.is_active ? "Deactivate" : "Activate"}</SmallButton></Td>
              </tr>
            ))}
          </Table>
        </DataState>
      </Card>
      <Modal open={open} title="Add user" onClose={() => setOpen(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Full name *"><Input required maxLength={100} value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} /></Field>
          <Field label="Email *"><Input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Role"><Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} options={opts(["Admin", "Claims Officer"])} /></Field>
          <Field label="Password *" hint="At least 8 characters with letters and numbers."><Input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></Field>
          <FormError message={formError} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Create</Button></div>
        </form>
      </Modal>
    </PageShell>
  );
}
