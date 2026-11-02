"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, DataState, PageShell, Table, Td } from "@/components/ui";

interface Report { key: string; title: string; rows: Record<string, unknown>[]; error: string | null }

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ reports: Report[] }>("/api/reports").then((d) => setReports(d.reports)).catch((err) => setError(err instanceof Error ? err.message : "Unable to load reports."));
  }, []);

  return (
    <PageShell title="Reports" subtitle="Analytical SQL queries: joins, GROUP BY / HAVING, subqueries, views and stored functions.">
      <DataState loading={!reports && !error} error={error} empty={reports?.length === 0} emptyText="No reports.">
        {reports?.map((report) => (
          <Card key={report.key} title={report.title}>
            {report.error ? <p className="text-sm text-red-700">{report.error}</p> : report.rows.length === 0 ? <p className="text-sm text-slate-500">No rows.</p> : (
              <Table headers={Object.keys(report.rows[0]).map((k) => k.replaceAll("_", " "))}>
                {report.rows.map((row, i) => (
                  <tr key={i}>{Object.values(row).map((v, j) => <Td key={j}>{v == null ? "—" : String(v)}</Td>)}</tr>
                ))}
              </Table>
            )}
          </Card>
        ))}
      </DataState>
    </PageShell>
  );
}
