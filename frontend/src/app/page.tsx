"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, formatAmount, formatDate, useCurrentUser } from "@/lib/client";
import { Badge, BarChart, Card, ColumnChart, PageShell, StatGrid, Table, Td } from "@/components/ui";

interface ChartRow { label: string; value: number }
interface DashboardStats {
  customers: number;
  policies: number;
  claims: number;
  settlements: number;
  totalClaimed: number;
  totalSettled: number;
  totalPaid: number;
  openClaims: number;
  pendingPayments: number;
  claimsByStatus: ChartRow[];
  claimsByMonth: ChartRow[];
  amountByPolicyType: ChartRow[];
  recentClaims: { claim_id: number; customer_name: string; claim_date: string; claimed_amount: string; claim_status: string; claim_priority: string | null }[];
  nosql: { evidencePending: number; openInvestigations: number; highRisk: number; activityToday: number } | null;
}

export default function Home() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState("");
  const user = useCurrentUser();

  useEffect(() => {
    api<DashboardStats>("/api/dashboard")
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load dashboard statistics."));
  }, []);

  const v = (value: number | undefined, fmt?: (n: number) => string) => (error ? "Unavailable" : value == null ? "Loading..." : fmt ? fmt(value) : value);

  return (
    <PageShell title={user?.role === "Claims Officer" ? "Claims Officer Dashboard" : "Admin Dashboard"} subtitle="Insurance Claims Processing System">
      <StatGrid
        items={[
          { label: "Customers", value: v(stats?.customers) },
          { label: "Policies", value: v(stats?.policies) },
          { label: "Total Claims", value: v(stats?.claims), hint: stats ? `${stats.openClaims} open` : undefined },
          { label: "Settlements", value: v(stats?.settlements), hint: stats ? `${stats.pendingPayments} awaiting payment` : undefined },
        ]}
      />
      <StatGrid
        items={[
          { label: "Total Claimed", value: v(stats?.totalClaimed, formatAmount) },
          { label: "Total Settled", value: v(stats?.totalSettled, formatAmount) },
          { label: "Total Paid Out", value: v(stats?.totalPaid, formatAmount) },
          {
            label: "Open Investigations",
            value: stats?.nosql ? stats.nosql.openInvestigations : stats ? "—" : v(undefined),
            hint: stats?.nosql ? `${stats.nosql.highRisk} high risk · ${stats.nosql.evidencePending} evidence pending` : stats ? "MongoDB not connected" : undefined,
          },
        ]}
      />

      {error && <p role="alert" className="text-red-700">{error}</p>}

      {stats && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Claims by status"><BarChart data={stats.claimsByStatus} /></Card>
            <Card title="Claimed amount by policy type"><BarChart data={stats.amountByPolicyType} format={formatAmount} /></Card>
          </div>
          <Card title="Claims registered per month (last 12 months)"><ColumnChart data={stats.claimsByMonth} /></Card>
          <Card title="Recent claims" actions={<Link href="/claims" className="text-sm text-blue-700 hover:underline">View all</Link>}>
            <Table headers={["Claim", "Customer", "Date", "Amount", "Priority", "Status"]}>
              {stats.recentClaims.map((c) => (
                <tr key={c.claim_id}>
                  <Td>#{c.claim_id}</Td>
                  <Td>{c.customer_name}</Td>
                  <Td>{formatDate(c.claim_date)}</Td>
                  <Td>{formatAmount(c.claimed_amount)}</Td>
                  <Td><Badge value={c.claim_priority} /></Td>
                  <Td><Badge value={c.claim_status} /></Td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </PageShell>
  );
}
