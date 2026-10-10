import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";

const onboardingSchema = z.object({
  // Limites do nome do negócio: ele aparece em destaque no cartão público, por
  // isso precisa caber em uma linha sem quebrar o modelo do cartão (2 a 80).
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do negócio (mínimo 2 caracteres).")
    .max(80, "O nome do negócio deve ter no máximo 80 caracteres."),
  businessPhone: z.string().trim().max(30).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: z.string().trim().length(2).toUpperCase().optional().or(z.literal("")),
  businessType: z.string().trim().max(80).optional().or(z.literal("")),
});

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "organization", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

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
        { status: 404 },
      );
    }

    return Response.json(result[0]);
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    console.error("Get organization error:", error);

    return Response.json(
      { error: "Não foi possível carregar a organização." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "organization", "update")) {
      throw new Error("FORBIDDEN");
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return Response.json({ error: "INVALID_DATA" }, { status: 400 });
    }

    const parsed = onboardingSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "INVALID_DATA", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Atualização parcial: só altera os campos efetivamente enviados. Os campos
    // omitidos (ex.: tela de Configurações enviando apenas "name") mantêm o valor
    // atual, evitando que o full replace do onboarding apague telefone, cidade,
    // estado ou tipo de negócio. O onboarding envia todos os campos e continua
    // funcionando exatamente como antes.
    const fields = body as Record<string, unknown>;
    const wasProvided = (key: string) =>
      Object.prototype.hasOwnProperty.call(fields, key);

    const current = await sql`
    SELECT
      name,
      business_phone,
      city,
      state,
      business_type,
      onboarding_completed
    FROM organizations
    WHERE id = ${currentUser.organization.id}
    LIMIT 1
  `;

    if (current.length === 0) {
      return Response.json(
        { error: "ORGANIZATION_NOT_FOUND" },
        { status: 404 },
      );
    }

    const existing = current[0];

    const nextBusinessPhone = wasProvided("businessPhone")
      ? parsed.data.businessPhone || null
      : existing.business_phone;
    const nextCity = wasProvided("city")
      ? parsed.data.city || null
      : existing.city;
    const nextState = wasProvided("state")
      ? parsed.data.state || null
      : existing.state;
    const nextBusinessType = wasProvided("businessType")
      ? parsed.data.businessType || null
      : existing.business_type;

    // O onboarding só é marcado como concluído quando o payload traz algum dos
    // campos de perfil do negócio (é o fluxo de onboarding que envia todos eles).
    // Um PATCH parcial (ex.: Configurações enviando apenas "name") preserva o
    // estado atual, evitando concluir o onboarding sem os dados do negócio.
    const onboardingFieldsProvided =
      wasProvided("businessPhone") ||
      wasProvided("city") ||
      wasProvided("state") ||
      wasProvided("businessType");

    const nextOnboardingCompleted = onboardingFieldsProvided
      ? true
      : existing.onboarding_completed;

    const result = await sql`
    UPDATE organizations
    SET
      name = ${parsed.data.name},
      business_phone = ${nextBusinessPhone},
      city = ${nextCity},
      state = ${nextState},
      business_type = ${nextBusinessType},
      onboarding_completed = ${nextOnboardingCompleted},
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
        { status: 404 },
      );
    }

    return Response.json(result[0]);
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    console.error("Update organization error:", error);

    return Response.json(
      { error: "Não foi possível atualizar a organização." },
      { status: 500 },
    );
  }
}
