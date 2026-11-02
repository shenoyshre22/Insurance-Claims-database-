import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { mongoPing } from "@/lib/mongo";

// Health check for both databases. Returns no data, only connectivity status.
export async function GET() {
  const result = { mysql: { success: false, message: "" }, mongodb: { success: false, message: "" } };
  try {
    await pool.query("SELECT 1 AS connection_test");
    result.mysql = { success: true, message: "Successfully connected to MySQL!" };
  } catch (error) {
    console.error("MySQL connection error:", error);
    result.mysql.message = "MySQL connection failed. Check your database configuration.";
  }
  try {
    const name = await mongoPing();
    result.mongodb = { success: true, message: `Successfully connected to MongoDB (${name}).` };
  } catch (error) {
    console.error("MongoDB connection error:", error);
    result.mongodb.message = "MongoDB connection failed. Check MONGODB_URI.";
  }
  const success = result.mysql.success && result.mongodb.success;
  return NextResponse.json({ success, ...result }, { status: success ? 200 : 500 });
}
