"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";

interface Assessment {
  assessment_id: number | string;
  claim_id: number | string;
  customer_name: string | null;
  assessor_name: string | null;
  assessment_date: string | null;
  assessed_amount: number | string | null;
  recommendation: string | null;
  remarks: string | null;
  assessor_specialization: string | null;
  claim_status: string | null;
}

interface RecommendationSummary {
  value: string | null;
  count: number;
}

interface AssessmentsResponse {
  assessments: Assessment[];
  total: number;
  totalAssessors: number;
  recommendations: RecommendationSummary[];
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

function formatAmount(value: number | string | null) {
  if (value == null) return "—";
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function AssessmentsPage() {
  const [search, setSearch] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [data, setData] = useState<AssessmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAssessments = useCallback(async (term: string, selectedRecommendation: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (term) params.set("search", term);
      if (selectedRecommendation) params.set("recommendation", selectedRecommendation);
      const response = await fetch(`/api/assessments?${params.toString()}`);
      const result = (await response.json()) as AssessmentsResponse;
      if (!response.ok) throw new Error(result.message ?? "Unable to load assessments.");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load assessments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => void loadAssessments(search.trim(), recommendation),
      250
    );
    return () => window.clearTimeout(timer);
  }, [loadAssessments, recommendation, search]);

  const stats = [
    { label: "Total assessments", value: data?.total ?? 0 },
    { label: "Total assessors", value: data?.totalAssessors ?? 0 },
    ...(data?.recommendations.map((item) => ({
      label: item.value ?? "No recommendation",
      value: item.count,
    })) ?? []),
  ];

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 p-8">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900">Claim Assessments</h2>
          <p className="mt-2 text-slate-500">
            View assessments performed by insurance claim assessors.
          </p>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
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
              {loading ? "Loading assessments…" : `${data?.assessments.length ?? 0} assessments shown`}
            </p>
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-2xl">
              <label className="flex-1">
                <span className="sr-only">Search assessments</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search assessment, claim, assessor, or customer…"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label>
                <span className="sr-only">Filter by recommendation</span>
                <select
                  value={recommendation}
                  onChange={(event) => setRecommendation(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100 sm:min-w-52"
                >
                  <option value="">All recommendations</option>
                  {data?.recommendations.map((item) => item.value && (
                    <option key={item.value} value={item.value}>{item.value}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <p role="status" className="py-12 text-center text-slate-500">Loading assessments…</p>
          ) : error ? (
            <div role="alert" className="py-12 text-center text-red-700">{error}</div>
          ) : !data?.assessments.length ? (
            <p className="py-12 text-center text-slate-500">
              {search.trim() || recommendation
                ? "No assessments match your search or filter."
                : "No assessment records found."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    {["Assessment ID", "Claim", "Customer", "Assessor", "Assessment date", "Assessed amount", "Recommendation", "Remarks"].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.assessments.map((assessment) => (
                    <tr key={String(assessment.assessment_id)} className="text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">{assessment.assessment_id}</td>
                      <td className="px-4 py-3">{assessment.claim_id}</td>
                      <td className="px-4 py-3">{assessment.customer_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div>{assessment.assessor_name ?? "—"}</div>
                        {assessment.assessor_specialization && (
                          <div className="text-xs text-slate-500">{assessment.assessor_specialization}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(assessment.assessment_date)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatAmount(assessment.assessed_amount)}</td>
                      <td className="px-4 py-3">{assessment.recommendation ?? "—"}</td>
                      <td className="max-w-72 px-4 py-3">{assessment.remarks ?? "—"}</td>
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
