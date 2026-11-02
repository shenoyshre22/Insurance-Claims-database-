import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    return ok({ user: await requireUser(request, "authenticated") });
  } catch (error) {
    return handleError(error, "load session");
  }
}
