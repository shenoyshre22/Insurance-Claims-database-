import { test } from "node:test";
import assert from "node:assert/strict";
import { can, canTransitionClaim, statusForRecommendation, validateAssessment, validateClaimAgainstPolicy, validatePayment, validateSettlement } from "../src/lib/rules.ts";
import { hashPassword, verifyPassword, passwordProblem } from "../src/lib/password.ts";
import { validateUpload } from "../src/lib/upload.ts";

const policy = { policyStatus: "Active", policyStart: "2026-01-01", policyEnd: "2026-12-31", coverageAmount: 100000, incidentDate: "2026-03-01", claimDate: "2026-03-02", claimedAmount: 5000 };

test("claims officer cannot settle, pay or delete; admin can", () => {
  assert.equal(can("Claims Officer", "claim:write"), true);
  for (const p of ["settlement:write", "payment:write", "customer:delete", "claim:delete", "policy:write", "user:manage"]) {
    assert.equal(can("Claims Officer", p), false, p);
    assert.equal(can("Admin", p), true, p);
  }
});

test("claims only on active policies within period and coverage", () => {
  assert.equal(validateClaimAgainstPolicy(policy), null);
  assert.match(validateClaimAgainstPolicy({ ...policy, policyStatus: "Expired" }), /Active/);
  assert.match(validateClaimAgainstPolicy({ ...policy, claimedAmount: 100001 }), /coverage/);
  assert.match(validateClaimAgainstPolicy({ ...policy, incidentDate: "2025-12-31" }), /policy period/);
  assert.match(validateClaimAgainstPolicy({ ...policy, claimDate: "2026-02-28" }), /before the incident/);
});

test("claim status transitions", () => {
  assert.equal(canTransitionClaim("Pending", "Approved"), true);
  assert.equal(canTransitionClaim("Settled", "Pending"), false);
  assert.equal(canTransitionClaim("Rejected", "Approved"), false);
  assert.equal(statusForRecommendation("Partially Approve"), "Approved");
  assert.equal(statusForRecommendation("Reject"), "Rejected");
  assert.equal(statusForRecommendation("Investigate"), "Under Review");
});

test("assessment cannot exceed claimed amount or touch settled claims", () => {
  assert.equal(validateAssessment(1000, 1000, "Pending"), null);
  assert.match(validateAssessment(1000, 1000.01, "Pending"), /exceed/);
  assert.match(validateAssessment(1000, 10, "Settled"), /settled/);
});

test("settlement needs approving assessment, no duplicate, <= assessed", () => {
  const base = { claimStatus: "Approved", hasExistingSettlement: false, latestRecommendation: "Approve", assessedAmount: 800, settlementAmount: 800 };
  assert.equal(validateSettlement(base), null);
  assert.match(validateSettlement({ ...base, hasExistingSettlement: true }), /already/);
  assert.match(validateSettlement({ ...base, latestRecommendation: "Reject" }), /approving/);
  assert.match(validateSettlement({ ...base, assessedAmount: null, latestRecommendation: null }), /assessed/);
  assert.match(validateSettlement({ ...base, settlementAmount: 801 }), /exceed/);
});

test("payments cannot overpay or duplicate", () => {
  const base = { settlementStatus: "Approved", settlementAmount: 1000, alreadyPaid: 400, paymentAmount: 600, duplicateReference: false };
  assert.equal(validatePayment(base), null);
  assert.match(validatePayment({ ...base, paymentAmount: 600.01 }), /outstanding/);
  assert.match(validatePayment({ ...base, alreadyPaid: 1000, paymentAmount: 1 }), /fully paid/);
  assert.match(validatePayment({ ...base, duplicateReference: true }), /reference/);
  assert.match(validatePayment({ ...base, settlementStatus: "Cancelled" }), /cancelled/);
});

test("password hashing", () => {
  const h = hashPassword("Secret123");
  assert.notEqual(h, "Secret123");
  assert.equal(verifyPassword("Secret123", h), true);
  assert.equal(verifyPassword("secret123", h), false);
  assert.notEqual(hashPassword("Secret123"), h);
  assert.ok(passwordProblem("short1"));
  assert.ok(passwordProblem("lettersonly"));
  assert.equal(passwordProblem("Letters123"), null);
});

test("upload validation checks magic bytes, not just extension", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  assert.equal(validateUpload("report.pdf", pdf).mime, "application/pdf");
  assert.equal(validateUpload("../../etc/re port.pdf", pdf).safeName, "re_port.pdf");
  assert.throws(() => validateUpload("evil.pdf", new Uint8Array([0x4d, 0x5a, 0, 0])), /Only PDF/);
  assert.throws(() => validateUpload("image.png", pdf), /Only PDF/);
  assert.throws(() => validateUpload("big.pdf", new Uint8Array(5 * 1024 * 1024 + 1).fill(0x25)), /5 MB/);
});

test("a payment cannot be reversed twice", async () => {
  const { canReversePayment } = await import("../src/lib/rules.ts");
  assert.equal(canReversePayment("Completed"), null);
  assert.equal(canReversePayment("Reversed"), "This payment has already been reversed.");
});
