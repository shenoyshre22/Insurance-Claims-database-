"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./client";

export interface Lookups {
  customers: { customer_id: number; name: string }[];
  policyTypes: { policy_type_id: number; policy_name: string }[];
  policies: { policy_id: number; customer_name: string; policy_name: string; policy_status: string; start_date: string; end_date: string; coverage_amount: string }[];
  assessors: { assessor_id: number; name: string; specialization: string | null }[];
  claims: { claim_id: number; claim_status: string; claimed_amount: string; customer_name: string }[];
}

export function useLookups() {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const reload = useCallback(() => {
    api<Lookups>("/api/lookups").then(setLookups).catch(() => setLookups(null));
  }, []);
  useEffect(reload, [reload]);
  return { lookups, reload };
}

export const CLAIM_STATUSES = ["Pending", "Under Review", "Approved", "Rejected", "Settled"];
export const CLAIM_PRIORITIES = ["Low", "Medium", "High", "Critical"];
export const POLICY_STATUSES = ["Active", "Expired", "Cancelled", "Suspended"];
export const RECOMMENDATIONS = ["Approve", "Partially Approve", "Reject", "Investigate"];
export const SETTLEMENT_STATUSES = ["Pending", "Approved", "Paid", "Cancelled"];
export const PAYMENT_METHODS = ["Bank Transfer", "NEFT", "RTGS", "UPI", "Cheque"];
export const EVIDENCE_STATUSES = ["Pending", "Verified", "Rejected"];
export const RISK_LEVELS = ["Low", "Medium", "High", "Critical"];
export const INVESTIGATION_STATUSES = ["Open", "In Progress", "Closed"];
export const INVESTIGATION_RECOMMENDATIONS = ["Approve Claim", "Reduce Payout", "Reject Claim", "Escalate", "Further Investigation"];

export const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));
