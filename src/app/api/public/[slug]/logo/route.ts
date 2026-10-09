import { sql } from "@/lib/db/client";
import { getPublishedOrganizationBySlug } from "@/lib/public/profile";

export const dynamic = "force-dynamic";

// Logo pública do cartão digital. Só serve imagens de organizações com cartão
// publicado — nunca de cartões desativados, preservando a visibilidade
// controlada pelo responsável (public_published).
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
      SELECT encode(logo_image, 'base64') AS data, logo_mime_type
      FROM organizations
      WHERE id = ${organization.id}
        AND logo_image IS NOT NULL
      LIMIT 1
    `;

    if (rows.length === 0 || !rows[0].data) {
      return Response.json({ error: "LOGO_NOT_FOUND" }, { status: 404 });
    }

    return new Response(new Uint8Array(Buffer.from(String(rows[0].data), "base64")), {
      headers: {
        "Content-Type": rows[0].logo_mime_type || "image/jpeg",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Get public logo error:", error);
    return Response.json(
      { error: "Não foi possível carregar a logo." },
      { status: 500 }
    );
  }
}
