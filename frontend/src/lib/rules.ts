// Pure business rules shared by API routes and unit tests (no imports on purpose).

export type Role = "Admin" | "User";
export const ROLES: Role[] = ["Admin", "User"];

export const CLAIM_STATUSES = ["Pending", "Under Review", "Approved", "Rejected", "Settled"] as const;
export const CLAIM_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export const POLICY_STATUSES = ["Active", "Expired", "Cancelled", "Suspended"] as const;
export const RECOMMENDATIONS = ["Approve", "Partially Approve", "Reject", "Investigate"] as const;
export const SETTLEMENT_STATUSES = ["Pending", "Approved", "Paid", "Cancelled"] as const;
export const PAYMENT_METHODS = ["Bank Transfer", "NEFT", "RTGS", "UPI", "Cheque"] as const;
export const EVIDENCE_STATUSES = ["Pending", "Verified", "Rejected"] as const;
export const RISK_LEVELS = ["Low", "Medium", "High", "Critical"] as const;
export const INVESTIGATION_RECOMMENDATIONS = ["Approve Claim", "Reduce Payout", "Reject Claim", "Escalate", "Further Investigation"] as const;

/** Admin manages all insurance data. Users may only authenticate and submit documents. */
const USER_PERMISSIONS = new Set(["authenticated", "evidence:submit"]);

export function can(role: Role, permission: string): boolean {
  if (role === "Admin") return true;
  return USER_PERMISSIONS.has(permission);
}

/** Claim statuses a claim may move to from its current status. "Settled" is only set by the settlement trigger. */
const TRANSITIONS: Record<string, string[]> = {
  Pending: ["Under Review", "Approved", "Rejected"],
  "Under Review": ["Pending", "Approved", "Rejected"],
  Approved: ["Under Review", "Rejected"],
  Rejected: ["Under Review"],
  Settled: [],
};

export function canTransitionClaim(from: string, to: string): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? CLAIM_STATUSES.filter((s) => s !== "Settled")).includes(to);
}

/** Maps an assessment recommendation to the claim status it implies. */
export function statusForRecommendation(recommendation: string): string {
  if (recommendation === "Approve" || recommendation === "Partially Approve") return "Approved";
  if (recommendation === "Reject") return "Rejected";
  return "Under Review";
}

export interface ClaimRuleInput {
  policyStatus: string;
  policyStart: string;
  policyEnd: string;
  coverageAmount: number;
  incidentDate: string;
  claimDate: string;
  claimedAmount: number;
}

/** Returns an error message, or null when a new claim is valid against its policy. */
export function validateClaimAgainstPolicy(input: ClaimRuleInput): string | null {
  if (input.policyStatus !== "Active") return "Claims can only be registered on Active policies.";
  if (!(input.claimedAmount > 0)) return "Claimed amount must be greater than zero.";
  if (input.claimedAmount > input.coverageAmount) return "Claimed amount cannot exceed the policy coverage amount.";
  if (input.incidentDate < input.policyStart || input.incidentDate > input.policyEnd)
    return "Incident date must fall within the policy period.";
  if (input.claimDate < input.incidentDate) return "Claim date cannot be before the incident date.";
  return null;
}

export function validateAssessment(claimedAmount: number, assessedAmount: number, claimStatus: string): string | null {
  if (claimStatus === "Settled") return "This claim is already settled and cannot be re-assessed.";
  if (!(assessedAmount >= 0)) return "Assessed amount cannot be negative.";
  if (assessedAmount > claimedAmount) return "Assessed amount cannot exceed the claimed amount.";
  return null;
}

export function validateSettlement(args: {
  claimStatus: string;
  hasExistingSettlement: boolean;
  latestRecommendation: string | null;
  assessedAmount: number | null;
  settlementAmount: number;
}): string | null {
  if (args.hasExistingSettlement) return "This claim already has a settlement.";
  if (args.assessedAmount == null || args.latestRecommendation == null) return "A claim must be assessed before it can be settled.";
  if (args.latestRecommendation !== "Approve" && args.latestRecommendation !== "Partially Approve")
    return "Only claims with an approving assessment can be settled.";
  if (args.claimStatus === "Rejected") return "Rejected claims cannot be settled.";
  if (!(args.settlementAmount > 0)) return "Settlement amount must be greater than zero.";
  if (args.settlementAmount > args.assessedAmount) return "Settlement amount cannot exceed the assessed amount.";
  return null;
}

export function validatePayment(args: {
  settlementStatus: string | null;
  settlementAmount: number;
  alreadyPaid: number;
  paymentAmount: number;
  duplicateReference: boolean;
}): string | null {
  if (args.settlementStatus === "Cancelled") return "Payments cannot be made against a cancelled settlement.";
  if (args.duplicateReference) return "A payment with this transaction reference already exists.";
  if (!(args.paymentAmount > 0)) return "Payment amount must be greater than zero.";
  const remaining = Math.round((args.settlementAmount - args.alreadyPaid) * 100) / 100;
  if (remaining <= 0) return "This settlement has already been fully paid.";
  if (args.paymentAmount > remaining) return `Payment exceeds the outstanding balance of ${remaining.toFixed(2)}.`;
  return null;
}

/** Returns an error message, or null when a payment with this status may be reversed. */
export function canReversePayment(currentStatus: string): string | null {
  if (currentStatus === "Reversed") return "This payment has already been reversed.";
  return null;
}
