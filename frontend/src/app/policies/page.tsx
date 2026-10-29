"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";

interface Policy {
  policy_id: number | string;
  customer_name: string | null;
  policy_name: string | null;
  start_date: string | null;
  end_date: string | null;
  premium_amount: number | string | null;
  coverage_amount: number | string | null;
  policy_status: string | null;
}

interface PoliciesResponse {
  policies: Policy[];
  total: number;
  policyTypes: number;
  activePolicies: number;
  message?: string;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(value: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${Number(day)} ${monthNames[Number(month) - 1] ?? month} ${year}`;
}

function formatAmount(value: number | string | null) {
  if (value == null) return "—";
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function PoliciesPage() {
  const [search, setSearch] = useState("");
  const [data, setData] = useState<PoliciesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPolicies = useCallback(async (term: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/policies?search=${encodeURIComponent(term)}`);
      const result = (await response.json()) as PoliciesResponse;
      if (!response.ok) throw new Error(result.message ?? "Unable to load policies.");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load policies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPolicies(search), 250);
    return () => window.clearTimeout(timer);
  }, [loadPolicies, search]);

  const stats = [
    ["Total policies", data?.total],
    ["Policy types", data?.policyTypes],
    ["Active policies", data?.activePolicies],
  ];

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 p-8">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900">Insurance Policies</h2>
          <p className="mt-2 text-slate-500">View registered insurance policies and their coverage details.</p>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{loading ? "…" : value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-slate-600">
              {loading ? "Loading policies…" : `${data?.policies.length ?? 0} policies shown`}
            </p>
            <label className="w-full sm:max-w-sm">
              <span className="sr-only">Search policies</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search policy ID, customer, or type…"
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          {loading ? (
            <p role="status" className="py-12 text-center text-slate-500">Loading policies…</p>
          ) : error ? (
            <div role="alert" className="py-12 text-center text-red-700">{error}</div>
          ) : !data?.policies.length ? (
            <p className="py-12 text-center text-slate-500">
              {search.trim() ? "No policies match your search." : "No policy records found."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    {["Policy ID", "Customer", "Policy type", "Start date", "End date", "Premium", "Coverage", "Status"].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.policies.map((policy) => (
                    <tr key={String(policy.policy_id)} className="text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">{policy.policy_id}</td>
                      <td className="px-4 py-3">{policy.customer_name ?? "—"}</td>
                      <td className="px-4 py-3">{policy.policy_name ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(policy.start_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(policy.end_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatAmount(policy.premium_amount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatAmount(policy.coverage_amount)}</td>
                      <td className="px-4 py-3">{policy.policy_status ?? "—"}</td>
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
