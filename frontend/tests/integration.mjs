// Optional live API test. Start the app and set ADMIN_EMAIL, ADMIN_PASSWORD,
// USER_EMAIL, USER_PASSWORD and TEST_CLAIM_ID before running this file.
import { test } from "node:test";
import assert from "node:assert/strict";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
};
async function call(cookie, method, path, body, isForm = false) {
  const headers = cookie ? { cookie } : {};
  if (body && !isForm) headers["content-type"] = "application/json";
  const response = await fetch(base + path, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { response, json };
}
async function login(email, password) {
  const result = await call(null, "POST", "/api/auth/login", { email, password });
  assert.equal(result.response.status, 200, JSON.stringify(result.json));
  return result.response.headers.get("set-cookie").split(";")[0];
}

test("User can only submit documents; Admin can review them", async () => {
  const admin = await login(required("ADMIN_EMAIL"), required("ADMIN_PASSWORD"));
  const user = await login(required("USER_EMAIL"), required("USER_PASSWORD"));
  assert.equal((await call(user, "GET", "/api/auth/me")).json.user.role, "User");
  assert.equal((await call(user, "GET", "/api/dashboard")).response.status, 403);
  assert.equal((await call(user, "GET", "/api/evidence")).response.status, 403);

  const form = new FormData();
  form.set("claim_id", required("TEST_CLAIM_ID"));
  form.set("evidence_type", "Police Report");
  form.set("description", "Access-control integration test document");
  form.set("file", new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], { type: "application/pdf" }), "test.pdf");
  const created = await call(user, "POST", "/api/evidence", form, true);
  assert.equal(created.response.status, 201, JSON.stringify(created.json));

  const evidenceId = created.json._id;
  assert.equal((await call(user, "PATCH", `/api/evidence/${evidenceId}`, { verification_status: "Verified" })).response.status, 403);
  assert.equal((await call(admin, "PATCH", `/api/evidence/${evidenceId}`, { verification_status: "Verified", notes: "Reviewed by admin" })).response.status, 200);
  assert.equal((await call(admin, "DELETE", `/api/evidence/${evidenceId}`)).response.status, 200);
});
