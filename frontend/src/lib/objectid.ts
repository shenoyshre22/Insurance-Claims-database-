import { ObjectId } from "mongodb";
import { ApiError } from "./http";

export function objectId(raw: string): ObjectId {
  if (!ObjectId.isValid(raw) || !/^[a-f0-9]{24}$/i.test(raw)) throw new ApiError(400, "Invalid document id.");
  return new ObjectId(raw);
}
