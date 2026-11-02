import { NextRequest } from "next/server";
import { GridFSBucket } from "mongodb";
import { requireUser } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/http";
import { COLLECTIONS, EVIDENCE_BUCKET, getMongoDb } from "@/lib/mongo";
import { objectId } from "@/lib/objectid";

type Params = { params: Promise<{ id: string }> };

/** Streams an evidence file to signed-in users only. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireUser(request);
    const _id = objectId((await params).id);
    const db = await getMongoDb();
    const doc = await db.collection(COLLECTIONS.evidence).findOne({ _id });
    if (!doc?.file?.file_id) throw new ApiError(404, "No file attached to this evidence.");
    const chunks: Buffer[] = [];
    for await (const chunk of new GridFSBucket(db, { bucketName: EVIDENCE_BUCKET }).openDownloadStream(doc.file.file_id)) {
      chunks.push(chunk as Buffer);
    }
    return new Response(Buffer.concat(chunks), {
      headers: {
        "Content-Type": doc.file.mime_type,
        "Content-Disposition": `inline; filename="${doc.file.original_name}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleError(error, "download evidence");
  }
}
