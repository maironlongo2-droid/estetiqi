import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { imageValidationError } from "@/lib/images/limits";
import { readPublicCardSupport } from "@/lib/public/profile";

export const dynamic = "force-dynamic";

// Capa do cartão digital (imagem opcional). Sempre lida/gravada na organização do
// USUÁRIO AUTENTICADO — nunca por um organization_id vindo do navegador.
//
// A coluna depende da migration 038: sem ela, as respostas indicam "pendente" e
// nenhuma imagem é simulada.

function toBytes(base64: string): Uint8Array<ArrayBuffer> {
  const raw = Buffer.from(base64, "base64");
  const bytes = new Uint8Array(raw.byteLength);
  bytes.set(raw);
  return bytes;
}

function authErrorResponse(error: unknown, fallback: string, action: string) {
  if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
    return Response.json(
      { error: "A organização está bloqueada. Fale com o suporte da EstetiQI." },
      { status: 403 }
    );
  }
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }
  console.error(`${action}:`, error);
  return Response.json({ error: fallback }, { status: 500 });
}

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "organization", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const support = await readPublicCardSupport();
    if (!support.cover) {
      return Response.json({ error: "COVER_NOT_SUPPORTED" }, { status: 404 });
    }

    const rows = await sql`
      SELECT encode(public_cover_image, 'base64') AS data, public_cover_mime_type
      FROM organizations
      WHERE id = ${currentUser.organization.id}
        AND public_cover_image IS NOT NULL
      LIMIT 1
    `;

    if (rows.length === 0 || !rows[0].data) {
      return Response.json({ error: "COVER_NOT_FOUND" }, { status: 404 });
    }

    return new Response(toBytes(String(rows[0].data)), {
      headers: {
        "Content-Type": rows[0].public_cover_mime_type || "image/webp",
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return authErrorResponse(
      error,
      "Não foi possível carregar a capa.",
      "Get organization cover error"
    );
  }
}

export async function PUT(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "organization", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const support = await readPublicCardSupport();
    if (!support.cover) {
      return Response.json(
        {
          error:
            "A capa do cartão depende da migration 038_public_card_accent.sql, que ainda não foi aplicada neste ambiente.",
        },
        { status: 503 }
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "ARQUIVO_NAO_ENVIADO" }, { status: 400 });
    }

    // Revalidação no servidor: tipo permitido e tamanho (a imagem chega já
    // redimensionada e recortada em 16:9 pelo navegador).
    const problem = imageValidationError(file.type, file.size);
    if (problem) {
      return Response.json({ error: problem }, { status: 400 });
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const result = await sql`
      UPDATE organizations
      SET
        public_cover_image = decode(${base64}, 'base64'),
        public_cover_mime_type = ${file.type},
        public_cover_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = ${currentUser.organization.id}
      RETURNING public_cover_updated_at
    `;

    if (result.length === 0) {
      return Response.json({ error: "ORGANIZATION_NOT_FOUND" }, { status: 404 });
    }

    return Response.json({
      hasCover: true,
      updatedAt: result[0].public_cover_updated_at,
    });
  } catch (error) {
    return authErrorResponse(
      error,
      "Não foi possível salvar a capa.",
      "Update organization cover error"
    );
  }
}

export async function DELETE() {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "organization", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const support = await readPublicCardSupport();
    if (!support.cover) {
      return Response.json({ error: "COVER_NOT_SUPPORTED" }, { status: 404 });
    }

    const result = await sql`
      UPDATE organizations
      SET
        public_cover_image = NULL,
        public_cover_mime_type = NULL,
        public_cover_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = ${currentUser.organization.id}
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json({ error: "ORGANIZATION_NOT_FOUND" }, { status: 404 });
    }

    return Response.json({ hasCover: false });
  } catch (error) {
    return authErrorResponse(
      error,
      "Não foi possível remover a capa.",
      "Delete organization cover error"
    );
  }
}
