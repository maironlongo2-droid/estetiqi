import { sql } from "@/lib/db/client";
import { getPublishedOrganizationBySlug } from "@/lib/public/profile";

export const dynamic = "force-dynamic";

// Foto pública de uma profissional do cartão digital. A consulta exige que a
// profissional pertença à organização publicada do slug, garantindo o
// isolamento entre organizações mesmo em uma rota sem autenticação.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;

  try {
    const organization = await getPublishedOrganizationBySlug(slug);
    if (!organization) {
      return Response.json({ error: "Cartão não encontrado." }, { status: 404 });
    }

    const rows = await sql`
      SELECT encode(photo_image, 'base64') AS data, photo_mime_type
      FROM professionals
      WHERE id = ${id}
        AND organization_id = ${organization.id}
        AND photo_image IS NOT NULL
      LIMIT 1
    `;

    if (rows.length === 0 || !rows[0].data) {
      return Response.json({ error: "PHOTO_NOT_FOUND" }, { status: 404 });
    }

    return new Response(new Uint8Array(Buffer.from(String(rows[0].data), "base64")), {
      headers: {
        "Content-Type": rows[0].photo_mime_type || "image/jpeg",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Get public professional photo error:", error);
    return Response.json(
      { error: "Não foi possível carregar a foto." },
      { status: 500 }
    );
  }
}
