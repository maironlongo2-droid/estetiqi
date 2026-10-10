import { sql } from "@/lib/db/client";
import { getPublishedOrganizationBySlug } from "@/lib/public/profile";

export const dynamic = "force-dynamic";

// Capa pública do cartão digital. Serve a imagem apenas de organizações com
// cartão PUBLICADO — nunca de cartões desativados. Sem capa cadastrada, a página
// pública gera o fundo a partir da cor de destaque e esta rota responde 404 (o
// cartão nunca exibe imagem quebrada).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const organization = await getPublishedOrganizationBySlug(slug);
    if (!organization) {
      return Response.json({ error: "Cartão não encontrado." }, { status: 404 });
    }

    const rows = await sql`
      SELECT encode(public_cover_image, 'base64') AS data, public_cover_mime_type
      FROM organizations
      WHERE id = ${organization.id}
        AND public_cover_image IS NOT NULL
      LIMIT 1
    `;

    if (rows.length === 0 || !rows[0].data) {
      return Response.json({ error: "COVER_NOT_FOUND" }, { status: 404 });
    }

    return new Response(
      new Uint8Array(Buffer.from(String(rows[0].data), "base64")),
      {
        headers: {
          "Content-Type": rows[0].public_cover_mime_type || "image/webp",
          "Cache-Control": "public, max-age=300",
        },
      }
    );
  } catch (error) {
    console.error("Get public cover error:", error);
    return Response.json(
      { error: "Não foi possível carregar a capa." },
      { status: 500 }
    );
  }
}
