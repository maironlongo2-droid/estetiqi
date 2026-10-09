import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { imageValidationError } from "@/lib/images/limits";

export const dynamic = "force-dynamic";

// Logo do negócio exibida no cartão digital. Somente membros da própria
// organização acessam/alteram (isolamento garantido por organization.id, que
// vem do usuário autenticado — nunca do cliente).

function toBytes(base64: string): Uint8Array<ArrayBuffer> {
  const raw = Buffer.from(base64, "base64");
  const bytes = new Uint8Array(raw.byteLength);
  bytes.set(raw);
  return bytes;
}

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "organization", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const rows = await sql`
      SELECT encode(logo_image, 'base64') AS data, logo_mime_type
      FROM organizations
      WHERE id = ${currentUser.organization.id}
        AND logo_image IS NOT NULL
      LIMIT 1
    `;

    if (rows.length === 0 || !rows[0].data) {
      return Response.json({ error: "LOGO_NOT_FOUND" }, { status: 404 });
    }

    return new Response(toBytes(String(rows[0].data)), {
      headers: {
        "Content-Type": rows[0].logo_mime_type || "image/jpeg",
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Get organization logo error:", error);
    return Response.json(
      { error: "Não foi possível carregar a logo." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "organization", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "ARQUIVO_NAO_ENVIADO" }, { status: 400 });
    }

    const problem = imageValidationError(file.type, file.size);
    if (problem) {
      return Response.json({ error: problem }, { status: 400 });
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const result = await sql`
      UPDATE organizations
      SET
        logo_image = decode(${base64}, 'base64'),
        logo_mime_type = ${file.type},
        logo_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = ${currentUser.organization.id}
      RETURNING logo_updated_at
    `;

    if (result.length === 0) {
      return Response.json({ error: "ORGANIZATION_NOT_FOUND" }, { status: 404 });
    }

    return Response.json({
      hasLogo: true,
      updatedAt: result[0].logo_updated_at,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Update organization logo error:", error);
    return Response.json(
      { error: "Não foi possível salvar a logo." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "organization", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const result = await sql`
      UPDATE organizations
      SET
        logo_image = NULL,
        logo_mime_type = NULL,
        logo_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = ${currentUser.organization.id}
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json({ error: "ORGANIZATION_NOT_FOUND" }, { status: 404 });
    }

    return Response.json({ hasLogo: false });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Delete organization logo error:", error);
    return Response.json(
      { error: "Não foi possível remover a logo." },
      { status: 500 }
    );
  }
}
