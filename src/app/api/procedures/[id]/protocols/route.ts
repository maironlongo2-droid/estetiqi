import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { readOrganizationWhatsAppCredentials } from "@/lib/communication/whatsapp-integration-store";
import {
  MAX_PROTOCOL_BYTES,
  protocolValidationError,
} from "@/lib/protocols/limits";
import {
  listProcedureProtocols,
  procedureBelongsToOrganization,
  readProtocolSchemaReadiness,
} from "@/lib/protocols/protocol-store";
import { protocolMetadataSchema } from "@/lib/validation/protocol";

export const dynamic = "force-dynamic";

// Protocolos de um procedimento (documentos PDF da própria clínica).
//
// SEGURANÇA: o procedimento é validado contra a organização do USUÁRIO
// AUTENTICADO (nunca contra um organization_id enviado pelo navegador). A
// organização de outro negócio nunca é alcançável por estas rotas.

function errorResponse(error: unknown, fallback: string, action: string) {
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "procedures", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id } = await context.params;
    const organizationId = currentUser.organization.id;

    if (!(await procedureBelongsToOrganization(organizationId, id))) {
      return Response.json(
        { error: "Procedimento não encontrado." },
        { status: 404 }
      );
    }

    const readiness = await readProtocolSchemaReadiness();
    const whatsapp = await readOrganizationWhatsAppCredentials(organizationId);

    return Response.json({
      protocols: readiness.ready
        ? await listProcedureProtocols(organizationId, id)
        : [],
      // O recurso depende da migration 034 e das credenciais da Meta. A tela
      // mostra exatamente o que falta em vez de simular upload/envio.
      schemaReady: readiness.ready,
      maxBytes: MAX_PROTOCOL_BYTES,
      whatsapp: {
        ready: whatsapp.ok,
        message: whatsapp.ok
          ? "O WhatsApp oficial está conectado para envios."
          : whatsapp.message,
      },
    });
  } catch (error) {
    return errorResponse(
      error,
      "Não foi possível carregar os protocolos.",
      "List procedure protocols error"
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "procedures", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id } = await context.params;
    const organizationId = currentUser.organization.id;

    if (!(await procedureBelongsToOrganization(organizationId, id))) {
      return Response.json(
        { error: "Procedimento não encontrado." },
        { status: 404 }
      );
    }

    const readiness = await readProtocolSchemaReadiness();
    if (!readiness.ready) {
      return Response.json(
        {
          error: "SCHEMA_PENDING",
          message:
            "A migration 034_procedure_protocols.sql ainda não foi aplicada neste ambiente. Nenhum documento pode ser anexado enquanto isso.",
        },
        { status: 503 }
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "Selecione o arquivo PDF do protocolo." },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Tipo e MIME informados pelo navegador NÃO são confiáveis: conferimos também
    // a assinatura real do arquivo (%PDF-) e o tamanho, no servidor.
    const problem = protocolValidationError({
      mimeType: file.type,
      byteLength: bytes.byteLength,
      head: bytes.slice(0, 5),
    });
    if (problem) {
      return Response.json({ error: problem }, { status: 400 });
    }

    const metadata = protocolMetadataSchema.safeParse({
      name: typeof form?.get("name") === "string" ? form.get("name") : "",
      description:
        typeof form?.get("description") === "string"
          ? form.get("description")
          : "",
      protocolKind: form?.get("protocolKind"),
      autoSend: form?.get("autoSend") === "true",
    });

    if (!metadata.success) {
      return Response.json(
        {
          error: "Dados do protocolo inválidos.",
          details: metadata.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, description, protocolKind, autoSend } = metadata.data;
    const base64 = Buffer.from(bytes).toString("base64");

    const previous = (await sql`
      SELECT COALESCE(MAX(version), 0) AS version
      FROM procedure_protocols
      WHERE organization_id = ${organizationId}
        AND procedure_id = ${id}
    `) as { version: number | string }[];
    const nextVersion = Number(previous[0]?.version ?? 0) + 1;

    // Troca da versão vigente + inserção da nova versão na MESMA transação: nunca
    // existe momento sem protocolo vigente e nunca sobram duas versões atuais.
    const results = await sql.transaction([
      sql`
        UPDATE procedure_protocols
        SET is_current = FALSE, updated_at = NOW()
        WHERE organization_id = ${organizationId}
          AND procedure_id = ${id}
          AND is_current = TRUE
      `,
      sql`
        INSERT INTO procedure_protocols (
          organization_id,
          procedure_id,
          name,
          description,
          protocol_kind,
          auto_send,
          mime_type,
          size_bytes,
          file_data,
          version,
          is_current,
          created_by_user_id
        )
        VALUES (
          ${organizationId},
          ${id},
          ${name},
          ${description && description.trim() ? description.trim() : null},
          ${protocolKind},
          ${Boolean(autoSend)},
          'application/pdf',
          ${bytes.byteLength},
          decode(${base64}, 'base64'),
          ${nextVersion},
          TRUE,
          ${currentUser.user.id ?? null}
        )
        RETURNING id, version
      `,
    ]);

    const inserted = (results[1] as { id: string; version: number }[])[0];

    return Response.json(
      {
        protocols: await listProcedureProtocols(organizationId, id),
        protocolId: inserted?.id ?? null,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(
      error,
      "Não foi possível salvar o protocolo.",
      "Create procedure protocol error"
    );
  }
}
