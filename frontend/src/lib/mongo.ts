import { MongoClient, type Db } from "mongodb";
import { ApiError } from "./http";

export const COLLECTIONS = {
  evidence: "claim_evidence",
  investigations: "investigation_records",
  activity: "claim_activity_logs",
  communications: "claim_communications",
} as const;
export const EVIDENCE_BUCKET = "evidence_files";

const globalForMongo = globalThis as unknown as {
  mongoClient?: Promise<MongoClient>;
  mongoIndexes?: Promise<void>;
};

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new ApiError(503, "MongoDB is not configured. Set MONGODB_URI.");
  if (!globalForMongo.mongoClient) {
    globalForMongo.mongoClient = new MongoClient(uri, { maxPoolSize: 10 }).connect().catch((error) => {
      globalForMongo.mongoClient = undefined;
      throw error;
    });
  }
  return globalForMongo.mongoClient;
}

export async function getMongoDb(): Promise<Db> {
  const client = await clientPromise();
  const db = client.db(process.env.MONGODB_DB || "insurance_claims_nosql");
  if (!globalForMongo.mongoIndexes) {
    globalForMongo.mongoIndexes = ensureIndexes(db).catch((error) => {
      globalForMongo.mongoIndexes = undefined;
      throw error;
    });
  }
  await globalForMongo.mongoIndexes;
  return db;
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection(COLLECTIONS.evidence).createIndexes([
      { key: { claim_id: 1, uploaded_at: -1 }, name: "claim_uploaded" },
      { key: { verification_status: 1 }, name: "verification_status" },
      { key: { evidence_type: 1 }, name: "evidence_type" },
      { key: { description: "text", tags: "text" }, name: "evidence_text" },
    ]),
    db.collection(COLLECTIONS.investigations).createIndexes([
      { key: { claim_id: 1, created_at: -1 }, name: "claim_created" },
      { key: { risk_level: 1, status: 1 }, name: "risk_status" },
    ]),
    db.collection(COLLECTIONS.communications).createIndexes([
      { key: { claim_id: 1, timestamp: -1 }, name: "claim_communication_time" },
      { key: { communication_type: 1, timestamp: -1 }, name: "type_time" },
      { key: { subject: "text", message: "text", sender: "text" }, name: "communication_text" },
    ]),
    db.collection(COLLECTIONS.activity).createIndexes([
      { key: { claim_id: 1, timestamp: 1 }, name: "claim_timeline" },
      { key: { action: 1, timestamp: -1 }, name: "action_time" },
      { key: { timestamp: -1 }, name: "recent" },
    ]),
  ]);
}

export async function mongoPing() {
  const db = await getMongoDb();
  await db.command({ ping: 1 });
  return db.databaseName;
}
