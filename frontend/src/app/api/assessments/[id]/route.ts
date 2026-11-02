import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/http";
import { RECOMMENDATIONS, statusForRecommendation, validateAssessment } from "@/lib/rules";
import { idParam, num, oneOf, readJson, str } from "@/lib/validate";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser(request, "assessment:write");
    const id = idParam((await params).id);
    const body = await readJson(request);
    const assessedAmount = num(body, "assessed_amount", { required: true, min: 0 })!;
    const recommendation = oneOf(body, "recommendation", RECOMMENDATIONS, { required: true })!;
    const remarks = str(body, "remarks", { max: 500 });

    const claimId = await withTransaction(async (connection) => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT ca.claim_id, cl.claim_status, cl.claimed_amount
         FROM CLAIM_ASSESSMENT ca JOIN CLAIM cl ON ca.claim_id = cl.claim_id
         WHERE ca.assessment_id = ? FOR UPDATE`,
        [id]
      );
      const row = rows[0];
      if (!row) throw new ApiError(404, "Assessment not found.");
      const problem = validateAssessment(Number(row.claimed_amount), assessedAmount, row.claim_status);
      if (problem) throw new ApiError(400, problem);
      await connection.query(
        "UPDATE CLAIM_ASSESSMENT SET assessed_amount = ?, recommendation = ?, remarks = ? WHERE assessment_id = ?",
        [assessedAmount, recommendation, remarks, id]
      );
      await connection.query("UPDATE CLAIM SET claim_status = ? WHERE claim_id = ?", [statusForRecommendation(recommendation), row.claim_id]);
      return Number(row.claim_id);
    });

    await logActivity(user, { claim_id: claimId, action: "ASSESSMENT_UPDATED", entity: "CLAIM_ASSESSMENT", entity_id: id, to_status: statusForRecommendation(recommendation), details: { assessed_amount: assessedAmount, recommendation } });
    return ok({ success: true });
  } catch (error) {
    return handleError(error, "update assessment");
  }
}
