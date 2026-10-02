import { sql } from "@/lib/db/client";

export async function GET() {
  try {
    const result = await sql`SELECT NOW() AS now`;

    return Response.json({
      status: "ok",
      database: "connected",
      time: result[0].now,
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    return Response.json(
      {
        status: "error",
        database: "disconnected",
      },
      { status: 500 }
    );
  }
}