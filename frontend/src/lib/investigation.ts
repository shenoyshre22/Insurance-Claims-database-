export const INVESTIGATION_STATUSES = ["Open", "In Progress", "Closed"] as const;

export function listField(body: Record<string, unknown>, key: string): string[] {
  const raw = body[key];
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("\n") : [];
  return items.map((item) => String(item).trim()).filter(Boolean).slice(0, 25).map((item) => item.slice(0, 300));
}
