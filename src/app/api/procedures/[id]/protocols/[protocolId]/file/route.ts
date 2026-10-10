import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { loadProtocolFile } from "@/lib/protocols/protocol-store";

export const dynamic = "force-dynamic";

// Leitura do PDF do protocolo. Rota AUTENTICADA: o arquivo só é entregue ao
// membro da organização dona do procedimento (filtro por organização +
// procedimento na própria consulta). Nada é publicado como link público e nenhum
// dado interno do EstetiQI é exposto ao abrir o documento.

function sanitizeFilename(name: string): { ascii: string; full: string } {
  const cleaned = name.replace(/[\r\n"\\/]/g, " ").trim().slice(0, 120);
  const withExtension = /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
  const ascii = withExtension
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
  return {
    ascii: ascii || "protocolo.pdf",
    full: encodeURIComponent(withExtension),
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; protocolId: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "procedures", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id, protocolId } = await context.params;

    const file = await loadProtocolFile(
      currentUser.organization.id,
      id,
      protocolId
    );

    if (!file) {
      return Response.json(
        { error: "Protocolo não encontrado." },
        { status: 404 }
      );
    }

    const filename = sanitizeFilename(file.name);
    // Cópia em buffer próprio tipado (Uint8Array<ArrayBuffer>) para o corpo da
    // resposta — o binário lido do banco pode vir com buffer compartilhado.
    const bytes = new Uint8Array(file.data.byteLength);
    bytes.set(file.data);
    const body = new Blob([bytes], { type: "application/pdf" });

    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename.ascii}"; filename*=UTF-8''${filename.full}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json(
        {
          error:
            "A organização está bloqueada. Fale com o suporte da EstetiQI.",
        },
        { status: 403 }
      );
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Get procedure protocol file error:", error);
    return Response.json(
      { error: "Não foi possível abrir o protocolo." },
      { status: 500 }
    );
  }
}
