"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatAmount, formatDate, useCurrentUser } from "@/lib/client";
import { Badge, Button, Card, DataState, Field, FormError, Input, Modal, Notice, PageShell, SearchBox, Select, SmallButton, Table, Td } from "@/components/ui";

type Customer = Record<string, string | number | boolean | null>;
interface ColumnMeta { name: string; dataType: string; columnType: string; nullable: boolean; hasDefault: boolean; primaryKey: boolean; maxLength: number | null }
interface CustomersResponse { customers: Customer[]; columns: string[]; columnMeta: ColumnMeta[]; total: number }
interface CustomerDetail { customer: Customer; policies: { policy_id: number; policy_name: string; start_date: string; end_date: string; coverage_amount: string; policy_status: string; claim_count: number }[] }

const NUMERIC = new Set(["int", "tinyint", "smallint", "mediumint", "bigint", "decimal", "float", "double"]);
const AGGREGATES = ["policy_count", "claim_count", "total_claimed"];

function formatCustomerValue(column: string, value: Customer[string] | undefined) {
  if (column.includes("date") && typeof value === "string") return formatDate(value);
  if (column === "total_claimed") return formatAmount(value as number);
  return value == null ? "—" : String(value);
}

function enumOptions(columnType: string) {
  const match = /^enum\((.*)\)$/.exec(columnType);
  return match ? match[1].split(",").map((v) => v.trim().replace(/^'|'$/g, "")) : null;
}

export default function CustomersPage() {
  const user = useCurrentUser();
  const [search, setSearch] = useState("");
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError("");
    try {
      setData(await api<CustomersResponse>(`/api/customers?search=${encodeURIComponent(term)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(search), 250);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const editable = (data?.columnMeta ?? []).filter((c) => !c.primaryKey);
  const columns = [...(data?.columns ?? []), ...AGGREGATES];

  function openForm(customer: Customer | null) {
    setEditing(customer);
    setForm(Object.fromEntries(editable.map((c) => [c.name, customer?.[c.name] == null ? "" : String(customer[c.name])])));
    setFormError("");
    setFormOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" ? null : v]));
      if (editing) {
        await api(`/api/customers/${editing.customer_id}`, { method: "PUT", json: body });
        setNotice("Customer updated.");
      } else {
        const res = await api<{ customer_id: number }>("/api/customers", { method: "POST", json: body });
        setNotice(`Customer #${res.customer_id} added.`);
      }
      setFormOpen(false);
      await load(search);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(customer: Customer) {
    if (!window.confirm(`Delete customer ${customer.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/customers/${customer.customer_id}`, { method: "DELETE" });
      setNotice("Customer deleted.");
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete customer.");
    }
  }

  async function view(customer: Customer) {
    try {
      setDetail(await api<CustomerDetail>(`/api/customers/${customer.customer_id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load customer.");
    }
  }

  return (
    <PageShell title="Customers" subtitle="Add, view, edit and delete customer records." actions={<Button onClick={() => openForm(null)} disabled={!data}>Add customer</Button>}>
      <Notice message={notice} onDone={() => setNotice("")} />
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <p className="text-slate-600">Total customers <span className="font-semibold text-slate-900">{loading ? "…" : data?.total}</span></p>
          <SearchBox value={search} onChange={setSearch} placeholder="Search customers…" />
        </div>
        <DataState loading={loading && !data} error={error} empty={(data?.customers.length ?? 0) === 0} emptyText={search.trim() ? "No customers match your search." : "No customer records found."}>
          <Table headers={[...columns.map((c) => c.replaceAll("_", " ")), "Actions"]}>
            {data?.customers.map((customer, index) => (
              <tr key={String(customer.customer_id ?? index)}>
                {columns.map((column) => <Td key={column}>{formatCustomerValue(column, customer[column])}</Td>)}
                <Td className="whitespace-nowrap">
                  <SmallButton onClick={() => view(customer)}>View</SmallButton>
                  <SmallButton onClick={() => openForm(customer)}>Edit</SmallButton>
                  {user?.role === "Admin" && <SmallButton className="text-red-700" onClick={() => remove(customer)}>Delete</SmallButton>}
                </Td>
              </tr>
            ))}
          </Table>
        </DataState>
      </Card>

      <Modal open={formOpen} title={editing ? `Edit customer #${editing.customer_id}` : "Add customer"} onClose={() => setFormOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {editable.map((column) => {
              const options = enumOptions(column.columnType);
              const label = `${column.name.replaceAll("_", " ")}${!column.nullable && !column.hasDefault ? " *" : ""}`;
              const value = form[column.name] ?? "";
              const set = (v: string) => setForm((f) => ({ ...f, [column.name]: v }));
              return (
                <Field key={column.name} label={label}>
                  {options ? (
                    <Select value={value} onChange={(e) => set(e.target.value)} options={options.map((o) => ({ value: o, label: o }))} placeholder="Select…" />
                  ) : (
                    <Input
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      required={!column.nullable && !column.hasDefault}
                      maxLength={column.maxLength ?? undefined}
                      type={column.dataType === "date" ? "date" : NUMERIC.has(column.dataType) ? "number" : column.name.includes("email") ? "email" : "text"}
                    />
                  )}
                </Field>
              );
            })}
          </div>
          <FormError message={formError} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(detail)} title={`Customer: ${detail?.customer.name ?? ""}`} onClose={() => setDetail(null)} wide>
        {detail && (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-3">
              {Object.entries(detail.customer).map(([k, val]) => (
                <div key={k}><dt className="text-xs uppercase text-slate-500">{k.replaceAll("_", " ")}</dt><dd className="text-slate-900">{formatCustomerValue(k, val)}</dd></div>
              ))}
            </dl>
            <h4 className="font-semibold text-slate-900">Policies</h4>
            <Table headers={["Policy", "Type", "Period", "Coverage", "Claims", "Status"]}>
              {detail.policies.map((p) => (
                <tr key={p.policy_id}>
                  <Td>#{p.policy_id}</Td><Td>{p.policy_name}</Td><Td>{formatDate(p.start_date)} – {formatDate(p.end_date)}</Td>
                  <Td>{formatAmount(p.coverage_amount)}</Td><Td>{p.claim_count}</Td><Td><Badge value={p.policy_status} /></Td>
                </tr>
              ))}
            </Table>
            {detail.policies.length === 0 && <p className="text-sm text-slate-500">No policies yet.</p>}
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
