"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Customer = Record<string, string | number | boolean | null>;

interface CustomersResponse {
  customers: Customer[];
  columns: string[];
  total: number;
  message?: string;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCustomerValue(column: string, value: Customer[string] | undefined) {
  if (column === "date_of_birth" && typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) {
      const [, year, month, day] = match;
      const monthName = monthNames[Number(month) - 1];
      if (monthName) return `${Number(day)} ${monthName} ${year}`;
    }
  }

  return value == null ? "—" : String(value);
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCustomers = useCallback(async (term: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/customers?search=${encodeURIComponent(term)}`);
      const data = (await response.json()) as CustomersResponse;
      if (!response.ok) throw new Error(data.message ?? "Unable to load customers.");
      setCustomers(data.customers);
      setColumns(data.columns);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCustomers(search), 250);
    return () => window.clearTimeout(timer);
  }, [loadCustomers, search]);

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-64 bg-slate-900 text-white p-6">
        <h1 className="text-xl font-bold mb-10">Insurance Claims</h1>
        <nav className="space-y-4">
          <Link href="/" className="block p-3 rounded-lg hover:bg-slate-800">Dashboard</Link>
          <Link href="/customers" aria-current="page" className="block p-3 rounded-lg bg-blue-700">Customers</Link>
          {["Policies", "Claims", "Assessments", "Settlements", "Payments"].map((item) => (
            <div key={item} aria-disabled="true" className="flex items-center justify-between gap-2 rounded-lg px-3 py-3 text-slate-400">
              <span>{item}</span>
              <span className="text-xs text-slate-500">Coming soon</span>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-8">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900">Customers</h2>
          <p className="text-slate-500 mt-2">View and search customer records.</p>
        </header>

        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <p className="text-slate-600">Total customers <span className="font-semibold text-slate-900">{loading ? "…" : total}</span></p>
            <label className="w-full sm:max-w-sm">
              <span className="sr-only">Search customers</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customers…"
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          {loading ? (
            <p role="status" className="py-12 text-center text-slate-500">Loading customers…</p>
          ) : error ? (
            <div role="alert" className="py-12 text-center text-red-700">{error}</div>
          ) : customers.length === 0 ? (
            <p className="py-12 text-center text-slate-500">
              {search.trim() ? "No customers match your search." : "No customer records found."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-medium">{column.replaceAll("_", " ")}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((customer, index) => (
                    <tr key={String(customer[columns[0]] ?? index)} className="text-slate-700">
                      {columns.map((column) => <td key={column} className="px-4 py-3">{formatCustomerValue(column, customer[column])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
