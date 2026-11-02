import { NextRequest } from "next/server";
import type { Filter, Document } from "mongodb";
import { requireUser } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { COLLECTIONS, getMongoDb } from "@/lib/mongo";

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const sp = request.nextUrl.searchParams;
    const filter: Filter<Document> = {};
    const claimId = Number(sp.get("claim_id"));
    if (Number.isInteger(claimId) && claimId > 0) filter.claim_id = claimId;
    const action = sp.get("action");
    if (action && /^[A-Z_]{3,60}$/.test(action)) filter.action = action;
    const from = sp.get("from");
    const to = sp.get("to");
    if ((from && /^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && /^\d{4}-\d{2}-\d{2}$/.test(to))) {
      const range: Record<string, Date> = {};
      if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) range.$gte = new Date(`${from}T00:00:00Z`);
      if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) range.$lte = new Date(`${to}T23:59:59Z`);
      filter.timestamp = range;
    }
    // Claim timelines read oldest → newest; the global feed shows newest first.
    const order = filter.claim_id ? 1 : -1;

    const collection = (await getMongoDb()).collection(COLLECTIONS.activity);
    const [logs, byAction, perDay, actions] = await Promise.all([
      collection.find(filter).sort({ timestamp: order }).limit(300).toArray(),
      collection.aggregate([{ $match: filter }, { $group: { _id: "$action", count: { $sum: 1 }, last: { $max: "$timestamp" } } }, { $sort: { count: -1 } }]).toArray(),
      collection.aggregate([
        { $match: { ...filter, timestamp: { $gte: new Date(Date.now() - 30 * 86400_000) } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      collection.distinct("action"),
    ]);
    return ok({ logs, byAction, perDay, actions: actions.sort() });
  } catch (error) {
    return handleError(error, "retrieve activity logs");
  }
}
