// End-to-end API test against a RUNNING app with real MySQL + MongoDB.
// Usage:
//   BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... OFFICER_EMAIL=... OFFICER_PASSWORD=... \
//     node --test tests/integration.mjs
// It creates its own customer/policy/claim records, so it is safe on a development database.
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v;
};

async function call(cookie, method, path, body, isForm = false) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body && !isForm) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, res };
}

async function login(email, password) {
  const r = await call(null, "POST", "/api/auth/login", { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const set = r.res.headers.get("set-cookie");
  assert.match(set, /icms_session=[a-f0-9]{64}/);
  assert.match(set, /HttpOnly/i);
  return set.split(";")[0];
}

const ctx = {};

test("authentication", async () => {
  assert.equal((await call(null, "GET", "/api/claims")).status, 401);
  assert.equal((await call(null, "POST", "/api/auth/login", { email: env("ADMIN_EMAIL"), password: "wrong-password1" })).status, 401);
  ctx.admin = await login(env("ADMIN_EMAIL"), env("ADMIN_PASSWORD"));
  ctx.officer = await login(env("OFFICER_EMAIL"), env("OFFICER_PASSWORD"));
  assert.equal((await call(ctx.admin, "GET", "/api/auth/me")).json.user.role, "Admin");
  assert.equal((await call(ctx.officer, "GET", "/api/auth/me")).json.user.role, "Claims Officer");
  const page = await call(null, "GET", "/claims");
  assert.equal(page.status, 307, "pages redirect to /login without a session");
});

test("customers CRUD + role checks + injection-safe search", async () => {
  const meta = (await call(ctx.officer, "GET", "/api/customers")).json.columnMeta;
  const body = {};
  for (const c of meta) {
    if (c.primaryKey) continue;
    if (c.name === "name") body.name = "Integration Tester";
    else if (c.name.includes("email")) body[c.name] = `it${Date.now()}@example.com`;
    else if (c.name.includes("phone")) body[c.name] = `9${String(Date.now()).slice(-9)}`;
    else if (c.dataType === "date") body[c.name] = "1990-01-01";
    else if (c.columnType.startsWith("enum(")) body[c.name] = c.columnType.match(/'([^']+)'/)[1];
    else if (!c.nullable && !c.hasDefault) body[c.name] = "Test";
  }
  const created = await call(ctx.officer, "POST", "/api/customers", body);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  ctx.customerId = created.json.customer_id;
  assert.equal((await call(ctx.officer, "PUT", `/api/customers/${ctx.customerId}`, { address: "Updated address" })).status, 200);
  const view = await call(ctx.officer, "GET", `/api/customers/${ctx.customerId}`);
  assert.equal(view.json.customer.name, "Integration Tester");
  assert.equal((await call(ctx.officer, "DELETE", `/api/customers/${ctx.customerId}`)).status, 403);
  const inj = await call(ctx.officer, "GET", `/api/customers?search=${encodeURIComponent("' OR 1=1 -- ")}`);
  assert.equal(inj.status, 200);
  assert.equal(inj.json.customers.length, 0);
  assert.equal((await call(ctx.officer, "POST", "/api/customers", { ...body, email: "not-an-email" })).status, 400);
});

test("policies: admin only, validation, status management", async () => {
  const types = (await call(ctx.admin, "GET", "/api/lookups")).json.policyTypes;
  const base = { customer_id: ctx.customerId, policy_type_id: types[0].policy_type_id, start_date: "2026-01-01", end_date: "2027-12-31", premium_amount: 5000, coverage_amount: 200000 };
  assert.equal((await call(ctx.officer, "POST", "/api/policies", base)).status, 403);
  assert.equal((await call(ctx.admin, "POST", "/api/policies", { ...base, end_date: "2025-01-01" })).status, 400);
  const created = await call(ctx.admin, "POST", "/api/policies", base);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  ctx.policyId = created.json.policy_id;
  const expired = await call(ctx.admin, "POST", "/api/policies", base);
  ctx.expiredPolicyId = expired.json.policy_id;
  assert.equal((await call(ctx.admin, "PATCH", `/api/policies/${ctx.expiredPolicyId}`, { policy_status: "Expired" })).status, 200);
  assert.equal((await call(ctx.admin, "PATCH", `/api/policies/${ctx.expiredPolicyId}`, { policy_status: "Bogus" })).status, 400);
});

test("claims: register in a transaction with policy rules", async () => {
  const claim = { policy_id: ctx.policyId, incident_type: "Collision", incident_date: "2026-03-01", location: "Pune", claimed_amount: 50000, claim_priority: "High" };
  assert.equal((await call(ctx.officer, "POST", "/api/claims", { ...claim, claimed_amount: 999999 })).status, 400);
  assert.equal((await call(ctx.officer, "POST", "/api/claims", { ...claim, policy_id: ctx.expiredPolicyId })).status, 400);
  const created = await call(ctx.officer, "POST", "/api/claims", claim);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  ctx.claimId = created.json.claim_id;
  const list = await call(ctx.officer, "GET", `/api/claims?priority=High&search=${ctx.claimId}`);
  assert.ok(list.json.claims.some((c) => c.claim_id === ctx.claimId));
  assert.equal((await call(ctx.officer, "PUT", `/api/claims/${ctx.claimId}`, { claim_status: "Settled" })).status, 400);
  assert.equal((await call(ctx.officer, "PUT", `/api/claims/${ctx.claimId}`, { claim_status: "Under Review" })).status, 200);
});

test("assessment updates claim status; cannot exceed claimed", async () => {
  const assessors = (await call(ctx.officer, "GET", "/api/lookups")).json.assessors;
  const base = { claim_id: ctx.claimId, assessor_id: assessors[0].assessor_id, assessed_amount: 40000, recommendation: "Approve" };
  assert.equal((await call(ctx.officer, "POST", "/api/assessments", { ...base, assessed_amount: 60000 })).status, 400);
  const r = await call(ctx.officer, "POST", "/api/assessments", base);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.claim_status, "Approved");
  ctx.assessmentId = r.json.assessment_id;
  assert.equal((await call(ctx.officer, "PUT", `/api/assessments/${ctx.assessmentId}`, { assessed_amount: 45000, recommendation: "Approve", remarks: "Revised" })).status, 200);
});

test("settlement: admin only, <= assessed, once per claim, trigger sets Settled", async () => {
  assert.equal((await call(ctx.officer, "POST", "/api/settlements", { claim_id: ctx.claimId, settlement_amount: 45000 })).status, 403);
  assert.equal((await call(ctx.admin, "POST", "/api/settlements", { claim_id: ctx.claimId, settlement_amount: 45001 })).status, 400);
  const r = await call(ctx.admin, "POST", "/api/settlements", { claim_id: ctx.claimId, settlement_amount: 45000 });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  ctx.settlementId = r.json.settlement_id;
  assert.equal((await call(ctx.admin, "POST", "/api/settlements", { claim_id: ctx.claimId, settlement_amount: 100 })).status, 400);
  const detail = await call(ctx.admin, "GET", `/api/claims/${ctx.claimId}`);
  assert.equal(detail.json.claim.claim_status, "Settled");
  assert.equal(detail.json.settlementPercentage, 90);
});

test("payments: no overpayment, no duplicate reference, concurrency-safe", async () => {
  const ref = `TXN-${Date.now()}`;
  const pay = (amount, reference) => call(ctx.admin, "POST", "/api/payments", { settlement_id: ctx.settlementId, payment_amount: amount, payment_method: "NEFT", transaction_reference: reference });
  assert.equal((await call(ctx.officer, "POST", "/api/payments", { settlement_id: ctx.settlementId, payment_amount: 1, payment_method: "NEFT" })).status, 403);
  assert.equal((await pay(45001)).status, 400);
  assert.equal((await pay(20000, ref)).status, 201);
  assert.equal((await pay(1000, ref)).status, 400, "duplicate reference rejected");
  // Two simultaneous requests for the full remaining 25000: row lock must let only one through.
  const [a, b] = await Promise.all([pay(25000, `${ref}-A`), pay(25000, `${ref}-B`)]);
  assert.deepEqual([a.status, b.status].sort(), [201, 400], JSON.stringify([a.json, b.json]));
  const settlements = (await call(ctx.admin, "GET", `/api/settlements?search=${ctx.settlementId}`)).json.settlements;
  const s = settlements.find((x) => x.settlement_id === ctx.settlementId);
  assert.equal(Number(s.total_paid), 45000);
  assert.equal(s.settlement_status, "Paid");
  assert.equal((await pay(1)).status, 400);
});

test("payment reversal: admin only, once, re-opens settlement and frees the balance", async () => {
  const list = (await call(ctx.admin, "GET", `/api/payments?search=${ctx.claimId}`)).json.payments;
  const p = list.find((x) => x.settlement_id === ctx.settlementId && Number(x.payment_amount) === 20000);
  assert.ok(p, "20000 payment exists");
  const reverse = (who) => call(who, "PATCH", `/api/payments/${p.payment_id}`, { payment_status: "Reversed", reason: "Bounced transfer" });
  assert.equal((await reverse(ctx.officer)).status, 403);
  const r = await reverse(ctx.admin);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.settlement_reopened, true);
  assert.equal((await reverse(ctx.admin)).status, 409);
  const s = (await call(ctx.admin, "GET", `/api/settlements?search=${ctx.settlementId}`)).json.settlements.find((x) => x.settlement_id === ctx.settlementId);
  assert.equal(Number(s.total_paid), 25000);
  assert.equal(s.settlement_status, "Approved");
  const repay = await call(ctx.admin, "POST", "/api/payments", { settlement_id: ctx.settlementId, payment_amount: 20000, payment_method: "RTGS", transaction_reference: `RE-${Date.now()}` });
  assert.equal(repay.status, 201, JSON.stringify(repay.json));
  assert.equal(repay.json.fully_paid, true);
});

test("MongoDB evidence: secure upload, download, verify", async () => {
  const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])], { type: "application/pdf" });
  const form = new FormData();
  form.set("claim_id", String(ctx.claimId));
  form.set("evidence_type", "Police Report");
  form.set("description", "FIR copy for collision");
  form.set("tags", "fir, police");
  form.set("file", pdf, "fir.pdf");
  const r = await call(ctx.officer, "POST", "/api/evidence", form, true);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  ctx.evidenceId = r.json._id;

  const bad = new FormData();
  bad.set("claim_id", String(ctx.claimId));
  bad.set("evidence_type", "Invoice");
  bad.set("description", "disguised executable");
  bad.set("file", new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0])]), "invoice.pdf");
  assert.equal((await call(ctx.officer, "POST", "/api/evidence", bad, true)).status, 415);

  const noClaim = new FormData();
  noClaim.set("claim_id", "99999999");
  noClaim.set("evidence_type", "Invoice");
  noClaim.set("description", "orphan");
  assert.equal((await call(ctx.officer, "POST", "/api/evidence", noClaim, true)).status, 400);

  const file = await fetch(`${BASE}/api/evidence/${ctx.evidenceId}/file`, { headers: { cookie: ctx.officer } });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "application/pdf");
  assert.equal((await fetch(`${BASE}/api/evidence/${ctx.evidenceId}/file`)).status, 401);

  assert.equal((await call(ctx.officer, "PATCH", `/api/evidence/${ctx.evidenceId}`, { verification_status: "Verified", notes: "Matches FIR registry" })).status, 200);
  const list = await call(ctx.officer, "GET", `/api/evidence?claim_id=${ctx.claimId}&status=Verified`);
  assert.equal(list.json.evidence.length, 1);
  assert.ok(list.json.summary.byStatus.some((s) => s._id === "Verified"));
  assert.equal((await call(ctx.officer, "DELETE", `/api/evidence/${ctx.evidenceId}`)).status, 403);
});

test("MongoDB investigations: create, $push findings, aggregation", async () => {
  const r = await call(ctx.officer, "POST", "/api/investigations", {
    claim_id: ctx.claimId, risk_level: "High", risk_score: 82, summary: "Inconsistent timeline",
    findings: "Repair invoice predates incident\nWitness unreachable", fraud_indicators: "Backdated invoice", recommendation: "Escalate",
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const id = r.json._id;
  assert.equal((await call(ctx.officer, "PUT", `/api/investigations/${id}`, { status: "In Progress", new_findings: "Garage confirmed date error" })).status, 200);
  const list = await call(ctx.officer, "GET", `/api/investigations?claim_id=${ctx.claimId}`);
  const rec = list.json.records.find((x) => x._id === id);
  assert.equal(rec.findings.length, 3);
  assert.ok(list.json.byRisk.some((x) => x._id === "High"));
  assert.ok(list.json.highRisk.some((x) => x._id === ctx.claimId && x.claim));
});

test("MongoDB communications: claim association and CRUD", async () => {
  const body = { claim_id: ctx.claimId, communication_type: "Email", subject: "Claim documents received", message: "The police report has been received.", sender: "Integration Tester" };
  const created = await call(ctx.officer, "POST", "/api/communications", body);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = created.json._id;
  assert.equal((await call(ctx.officer, "POST", "/api/communications", { ...body, claim_id: 99999999 })).status, 400);
  assert.equal((await call(ctx.officer, "PUT", `/api/communications/${id}`, { subject: "Documents verified" })).status, 200);
  const listed = await call(ctx.officer, "GET", `/api/communications?claim_id=${ctx.claimId}&communication_type=Email`);
  assert.ok(listed.json.communications.some((record) => record._id === id && record.subject === "Documents verified"));
  assert.equal((await call(ctx.officer, "DELETE", `/api/communications/${id}`)).status, 403);
  assert.equal((await call(ctx.admin, "DELETE", `/api/communications/${id}`)).status, 200);
});

test("MongoDB activity log is chronological per claim", async () => {
  const r = await call(ctx.officer, "GET", `/api/activity?claim_id=${ctx.claimId}`);
  const actions = r.json.logs.map((l) => l.action);
  for (const a of ["CLAIM_REGISTERED", "CLAIM_STATUS_CHANGED", "ASSESSMENT_RECORDED", "SETTLEMENT_CREATED", "PAYMENT_RECORDED", "EVIDENCE_UPLOADED", "INVESTIGATION_OPENED", "COMMUNICATION_RECORDED"]) {
    assert.ok(actions.includes(a), `missing ${a}`);
  }
  const times = r.json.logs.map((l) => Date.parse(l.timestamp));
  assert.deepEqual(times, [...times].sort((x, y) => x - y));
  assert.ok(actions.indexOf("CLAIM_REGISTERED") < actions.indexOf("SETTLEMENT_CREATED"));
});

test("dashboard, reports and referential integrity on delete", async () => {
  const d = await call(ctx.officer, "GET", "/api/dashboard");
  assert.equal(d.status, 200);
  assert.ok(d.json.claims >= 1 && d.json.totalPaid >= 45000 && d.json.nosql);
  const rep = await call(ctx.officer, "GET", "/api/reports");
  assert.deepEqual(rep.json.reports.filter((x) => x.error).map((x) => `${x.key}: ${x.error}`), []);
  assert.equal((await call(ctx.admin, "DELETE", `/api/customers/${ctx.customerId}`)).status, 409);
  assert.equal((await call(ctx.admin, "DELETE", `/api/claims/${ctx.claimId}`)).status, 409);
  assert.equal((await call(ctx.admin, "DELETE", `/api/policies/${ctx.expiredPolicyId}`)).status, 200);
});

test("logout invalidates the session", async () => {
  assert.equal((await call(ctx.officer, "POST", "/api/auth/logout")).status, 200);
  assert.equal((await call(ctx.officer, "GET", "/api/auth/me")).status, 401);
});
