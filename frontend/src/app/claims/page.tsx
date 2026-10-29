"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";

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
}

interface StatusSummary {
  value: string;
  count: number;
}

interface ClaimsResponse {
  claims: Claim[];
  total: number;
  totalClaimedAmount: number;
  statuses: StatusSummary[];
  message?: string;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(value: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${Number(day)} ${monthNames[Number(month) - 1] ?? month} ${year}`;
}

function formatAmount(value: number | string) {
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function ClaimsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<ClaimsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadClaims = useCallback(async (term: string, selectedStatus: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (term) params.set("search", term);
      if (selectedStatus) params.set("status", selectedStatus);
      const response = await fetch(`/api/claims?${params.toString()}`);
      const result = (await response.json()) as ClaimsResponse;
      if (!response.ok) throw new Error(result.message ?? "Unable to load claims.");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load claims.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadClaims(search.trim(), status), 250);
    return () => window.clearTimeout(timer);
  }, [loadClaims, search, status]);

  const stats = [
    { label: "Total claims", value: data?.total ?? 0 },
    { label: "Total claimed amount", value: formatAmount(data?.totalClaimedAmount ?? 0) },
    ...(data?.statuses.map((item) => ({ label: item.value, value: item.count })) ?? []),
  ];

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 p-8">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900">Claims Management</h2>
          <p className="mt-2 text-slate-500">View and track insurance claims, their incidents, and current status.</p>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{loading ? "…" : stat.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-slate-600">
              {loading ? "Loading claims…" : `${data?.claims.length ?? 0} claims shown`}
            </p>
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-2xl">
              <label className="flex-1">
                <span className="sr-only">Search claims</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search claim, customer, policy, or status…"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label>
                <span className="sr-only">Filter by claim status</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100 sm:min-w-52"
                >
                  <option value="">All statuses</option>
                  {data?.statuses.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <p role="status" className="py-12 text-center text-slate-500">Loading claims…</p>
          ) : error ? (
            <div role="alert" className="py-12 text-center text-red-700">{error}</div>
          ) : !data?.claims.length ? (
            <p className="py-12 text-center text-slate-500">
              {search.trim() || status ? "No claims match your search or filter." : "No claim records found."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    {["Claim ID", "Customer", "Policy", "Incident", "Incident date", "Claim date", "Claimed amount", "Priority", "Status"].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.claims.map((claim) => (
                    <tr key={claim.claim_id} className="text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">{claim.claim_id}</td>
                      <td className="px-4 py-3">{claim.customer_name}</td>
                      <td className="px-4 py-3">{claim.policy_name}<span className="block text-xs text-slate-500">ID {claim.policy_id}</span></td>
                      <td className="px-4 py-3">{claim.incident_type}{claim.incident_location && <span className="block text-xs text-slate-500">{claim.incident_location}</span>}{claim.incident_description && <span className="block max-w-64 text-xs text-slate-500">{claim.incident_description}</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(claim.incident_date)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(claim.claim_date)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatAmount(claim.claimed_amount)}</td>
                      <td className="px-4 py-3">{claim.claim_priority ?? "—"}</td>
                      <td className="px-4 py-3">{claim.claim_status}</td>
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
