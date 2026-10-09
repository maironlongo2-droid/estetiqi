import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { imageValidationError } from "@/lib/images/limits";

export const dynamic = "force-dynamic";

// Foto de uma profissional. Sempre filtrada por organization.id (do usuário
// autenticado) e pelo id da profissional, garantindo o isolamento entre
// organizações: uma empresa nunca lê ou altera a foto de outra.

async function belongsToOrganization(id: string, organizationId: string) {
  const rows = await sql`
    SELECT id
    FROM professionals
    WHERE id = ${id}
      AND organization_id = ${organizationId}
    LIMIT 1
  `;
  return rows.length > 0;
}

function toBytes(base64: string): Uint8Array<ArrayBuffer> {
  const raw = Buffer.from(base64, "base64");
  const bytes = new Uint8Array(raw.byteLength);
  bytes.set(raw);
  return bytes;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id } = await params;
    const organizationId = currentUser.organization.id;

    const rows = await sql`
      SELECT encode(photo_image, 'base64') AS data, photo_mime_type
      FROM professionals
      WHERE id = ${id}
        AND organization_id = ${organizationId}
        AND photo_image IS NOT NULL
      LIMIT 1
    `;

    if (rows.length === 0 || !rows[0].data) {
      return Response.json({ error: "PHOTO_NOT_FOUND" }, { status: 404 });
    }

    return new Response(toBytes(String(rows[0].data)), {
      headers: {
        "Content-Type": rows[0].photo_mime_type || "image/jpeg",
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
    console.error("Get professional photo error:", error);
    return Response.json(
      { error: "Não foi possível carregar a foto." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id } = await params;
    const organizationId = currentUser.organization.id;

    if (!(await belongsToOrganization(id, organizationId))) {
      return Response.json(
        { error: "PROFESSIONAL_NOT_FOUND" },
        { status: 404 }
      );
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
      UPDATE professionals
      SET
        photo_image = decode(${base64}, 'base64'),
        photo_mime_type = ${file.type},
        photo_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      RETURNING photo_updated_at
    `;

    return Response.json({
      hasPhoto: true,
      updatedAt: result[0]?.photo_updated_at ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Update professional photo error:", error);
    return Response.json(
      { error: "Não foi possível salvar a foto." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id } = await params;
    const organizationId = currentUser.organization.id;

    const result = await sql`
      UPDATE professionals
      SET
        photo_image = NULL,
        photo_mime_type = NULL,
        photo_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json(
        { error: "PROFESSIONAL_NOT_FOUND" },
        { status: 404 }
      );
    }

    return Response.json({ hasPhoto: false });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Delete professional photo error:", error);
    return Response.json(
      { error: "Não foi possível remover a foto." },
      { status: 500 }
    );
  }
}
