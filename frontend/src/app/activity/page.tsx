"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api, formatDateTime } from "@/lib/client";
import { Badge, BarChart, Card, ColumnChart, DataState, Input, PageShell, Select } from "@/components/ui";

interface Log {
  _id: string;
  claim_id: number | null;
  action: string;
  entity: string;
  entity_id: string | null;
  from_status?: string | null;
  to_status?: string | null;
  details?: Record<string, unknown>;
  performed_by: { name: string; role: string } | null;
  timestamp: string;
}
interface ActivityResponse { logs: Log[]; byAction: { _id: string; count: number }[]; perDay: { _id: string; count: number }[]; actions: string[] }

const pretty = (action: string) => action.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

export default function ActivityPage() {
  return (
    <Suspense>
      <ActivityPageContent />
    </Suspense>
  );
}

function ActivityPageContent() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState({ claim_id: searchParams.get("claim_id") ?? "", action: "", from: "", to: "" });
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<ActivityResponse>(`/api/activity?${new URLSearchParams(filters)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load activity.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  return (
    <PageShell title="Activity Logs" subtitle={filters.claim_id ? `Chronological timeline for claim #${filters.claim_id}` : "Recent claim status changes and user activity."}>
      <Card>
        <div className="mb-6 grid gap-3 md:grid-cols-4">
          <Input aria-label="Claim ID" type="number" min="1" placeholder="Claim ID (shows timeline)" value={filters.claim_id} onChange={(e) => setFilters((f) => ({ ...f, claim_id: e.target.value }))} />
          <Select aria-label="Action" value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} options={(data?.actions ?? []).map((a) => ({ value: a, label: pretty(a) }))} placeholder="All actions" />
          <Input aria-label="From" type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          <Input aria-label="To" type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        </div>
        <DataState loading={loading && !data} error={error} empty={(data?.logs.length ?? 0) === 0} emptyText="No activity recorded for these filters.">
          <ol className="relative ml-3 border-l border-slate-200">
            {data?.logs.map((log) => (
              <li key={log._id} className="mb-6 ml-6">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-700" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{pretty(log.action)}</span>
                  {log.claim_id != null && <span className="text-sm text-slate-500">claim #{log.claim_id}</span>}
                  {log.from_status && log.to_status && log.from_status !== log.to_status && (
                    <span className="flex items-center gap-1 text-sm"><Badge value={log.from_status} /> → <Badge value={log.to_status} /></span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {formatDateTime(log.timestamp)} · {log.performed_by ? `${log.performed_by.name} (${log.performed_by.role})` : "system"} · {log.entity}{log.entity_id ? ` ${log.entity_id}` : ""}
                </p>
                {log.details && Object.keys(log.details).length > 0 && (
                  <p className="mt-1 text-xs text-slate-600">{Object.entries(log.details).filter(([, v]) => v != null && v !== false).map(([k, v]) => `${k.replaceAll("_", " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ")}</p>
                )}
              </li>
            ))}
          </ol>
        </DataState>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Activity by type"><BarChart data={(data?.byAction ?? []).map((a) => ({ label: pretty(a._id), value: a.count }))} /></Card>
        <Card title="Activity per day (last 30 days)"><ColumnChart data={(data?.perDay ?? []).map((d) => ({ label: d._id, value: d.count }))} /></Card>
      </div>
    </PageShell>
  );
}
