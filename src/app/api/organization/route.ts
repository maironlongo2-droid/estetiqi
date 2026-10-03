import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";

const onboardingSchema = z.object({
  name: z.string().trim().min(2).max(120),
  businessPhone: z.string().trim().max(30).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: z.string().trim().length(2).toUpperCase().optional().or(z.literal("")),
  businessType: z.string().trim().max(80).optional().or(z.literal("")),
});

export async function GET() {
  const currentUser = await requireCurrentUser();

  const result = await sql`
    SELECT
      id,
      name,
      slug,
      business_phone,
      city,
      state,
      business_type,
      onboarding_completed
    FROM organizations
    WHERE id = ${currentUser.organization.id}
    LIMIT 1
  `;

  if (result.length === 0) {
    return Response.json(
      { error: "ORGANIZATION_NOT_FOUND" },
      { status: 404 }
    );
  }

  return Response.json(result[0]);
}

export async function PATCH(request: Request) {
  const currentUser = await requireCurrentUser();
  if (!hasPermission(currentUser.role, "organization", "update")) {
    throw new Error("FORBIDDEN");
  }

  const body = await request.json();
  const parsed = onboardingSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_DATA", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await sql`
    UPDATE organizations
    SET
      name = ${parsed.data.name},
      business_phone = ${parsed.data.businessPhone || null},
      city = ${parsed.data.city || null},
      state = ${parsed.data.state || null},
      business_type = ${parsed.data.businessType || null},
      onboarding_completed = TRUE,
      updated_at = NOW()
    WHERE id = ${currentUser.organization.id}
    RETURNING
      id,
      name,
      slug,
      business_phone,
      city,
      state,
      business_type,
      onboarding_completed
  `;

  if (result.length === 0) {
    return Response.json(
      { error: "ORGANIZATION_NOT_FOUND" },
      { status: 404 }
    );
  }

  return Response.json(result[0]);
}
