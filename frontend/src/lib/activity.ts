import { COLLECTIONS, getMongoDb } from "./mongo";
import type { SessionUser } from "./auth";

export interface ActivityInput {
  claim_id: number | null;
  action: string;
  entity: string;
  entity_id?: string | number | null;
  details?: Record<string, unknown>;
  from_status?: string | null;
  to_status?: string | null;
}

/**
 * Appends a document to claim_activity_logs. Logging is best-effort: a MongoDB outage
 * must never roll back or block a committed MySQL operation.
 */
export async function logActivity(user: SessionUser | null, input: ActivityInput) {
  try {
    const db = await getMongoDb();
    await db.collection(COLLECTIONS.activity).insertOne({
      ...input,
      entity_id: input.entity_id == null ? null : String(input.entity_id),
      performed_by: user ? { user_id: user.user_id, name: user.full_name, role: user.role } : null,
      timestamp: new Date(),
    });
  } catch (error) {
    console.warn("Activity log write skipped:", error instanceof Error ? error.message : error);
  }
}
