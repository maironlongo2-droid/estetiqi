import { z } from "zod";
import { sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/pg-errors";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { isValidPublicSlug, normalizeSlug } from "@/lib/public/slug";
import {
  PUBLIC_ACCENT_KEYS,
  resolvePublicAccent,
} from "@/lib/public/accent";
import { readPublicCardSupport } from "@/lib/public/profile";
import {
  googleMapsUrl,
  instagramUrl,
  normalizeWhatsapp,
} from "@/lib/public/contact-links";

const updateSchema = z.object({
  published: z.boolean(),
  slug: z.string().trim().max(60).optional().or(z.literal("")),
  // A chamada curta aparece abaixo do nome no cartão público: entre 10 e 120
  // caracteres quando preenchida.
  headline: z
    .string()
    .trim()
    .min(10, "A chamada curta deve ter pelo menos 10 caracteres.")
    .max(120, "A chamada curta deve ter no máximo 120 caracteres.")
    .optional()
    .or(z.literal("")),
  bio: z.string().trim().max(600).optional().or(z.literal("")),
  instagram: z.string().trim().max(120).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  mapsUrl: z.string().trim().max(500).optional().or(z.literal("")),
  // Cor de destaque: SOMENTE as chaves da paleta fechada. Qualquer outro valor é
  // rejeitado (nunca vira CSS aplicado na página pública).
  accent: z.enum(PUBLIC_ACCENT_KEYS).optional(),
});

type PublicCardRow = {
  name: string;
  public_slug: string | null;
  public_published: boolean;
  public_headline: string | null;
  public_bio: string | null;
  public_instagram: string | null;
  public_whatsapp: string | null;
  public_maps_url: string | null;
  public_accent: string | null;
  has_logo: boolean;
  logo_updated_at: string | null;
  has_cover?: boolean;
  public_cover_updated_at?: string | null;
};

function toConfig(row: PublicCardRow) {
  const suggestedSlug = normalizeSlug(row.name) || "meu-negocio";

  return {
    published: row.public_published,
    slug: row.public_slug,
    suggestedSlug,
    headline: row.public_headline,
    bio: row.public_bio,
    instagram: row.public_instagram,
    whatsapp: row.public_whatsapp,
    mapsUrl: row.public_maps_url,
    // Chave validada: valor ausente/inválido cai no padrão do aplicativo.
    accent: resolvePublicAccent(row.public_accent),
    hasLogo: Boolean(row.has_logo),
    logoVersion: row.logo_updated_at
      ? new Date(row.logo_updated_at).getTime()
      : null,
    hasCover: Boolean(row.has_cover),
    coverVersion: row.public_cover_updated_at
      ? new Date(row.public_cover_updated_at).getTime()
      : null,
  };
}

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "organization", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    // A cor de destaque e a capa dependem da migration 038. Sem ela, o cartão
    // segue funcionando com os valores padrão e a tela administrativa informa o
    // que falta aplicar.
    const support = await readPublicCardSupport();
    const organizationId = currentUser.organization.id;

    const rows = await sql`
      SELECT
        name,
        public_slug,
        public_published,
        public_headline,
        public_bio,
        public_instagram,
        public_whatsapp,
        public_maps_url,
        (logo_image IS NOT NULL) AS has_logo,
        logo_updated_at
        ${support.accent ? sql`, public_accent` : sql`, NULL::varchar(20) AS public_accent`}
        ${support.cover ? sql`, (public_cover_image IS NOT NULL) AS has_cover, public_cover_updated_at` : sql`, FALSE AS has_cover, NULL::timestamptz AS public_cover_updated_at`}
      FROM organizations
      WHERE id = ${organizationId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json({ error: "ORGANIZATION_NOT_FOUND" }, { status: 404 });
    }

    return Response.json({
      ...toConfig(rows[0] as PublicCardRow),
      accentSupported: support.accent,
      coverSupported: support.cover,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Get public card config error:", error);
    return Response.json(
      { error: "Não foi possível carregar as configurações do cartão." },
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

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const { published } = parsed.data;
    const nextAccent = parsed.data.accent ?? null;
    const slug = normalizeSlug(parsed.data.slug || "");
    const organizationId = currentUser.organization.id;
    // Estrutura da migration 038 (cor de destaque/capa). Quando ela não está
    // aplicada, o campo é simplesmente ignorado e a resposta avisa a interface.
    const support = await readPublicCardSupport();

    // Para publicar é obrigatório um endereço válido e único.
    if (published) {
      if (!isValidPublicSlug(slug)) {
        return Response.json(
          {
            error:
              "Escolha um endereço válido com pelo menos 3 caracteres (letras, números e hífen).",
          },
          { status: 400 }
        );
      }

      const conflict = await sql`
        SELECT id
        FROM organizations
        WHERE LOWER(public_slug) = LOWER(${slug})
          AND id <> ${organizationId}
        LIMIT 1
      `;
      if (conflict.length > 0) {
        return Response.json(
          { error: "Este endereço já está em uso. Escolha outro." },
          { status: 409 }
        );
      }
    }

    const nextSlug = slug || null;
    const nextHeadline = parsed.data.headline || null;
    const nextBio = parsed.data.bio || null;
    const nextInstagram = parsed.data.instagram || null;
    const nextWhatsapp = parsed.data.whatsapp || null;
    const nextMapsUrl = parsed.data.mapsUrl || null;

    // Validacao no servidor (nunca confiar apenas no navegador): rejeita valores
    // que nao gerariam um link publico valido e seguro. Campos vazios sao
    // permitidos e simplesmente nao aparecem no cartao.
    if (nextInstagram && !instagramUrl(nextInstagram)) {
      return Response.json(
        {
          error:
            "Informe um Instagram valido (ex.: @seuinsta ou https://instagram.com/seuinsta).",
        },
        { status: 400 }
      );
    }
    if (nextWhatsapp && !normalizeWhatsapp(nextWhatsapp)) {
      return Response.json(
        { error: "Informe um WhatsApp valido com DDD (ex.: (11) 99999-9999)." },
        { status: 400 }
      );
    }
    if (nextMapsUrl && !googleMapsUrl(nextMapsUrl)) {
      return Response.json(
        {
          error:
            "Use um link de compartilhamento do Google Maps (ex.: https://maps.app.goo.gl/... ou https://www.google.com/maps/...).",
        },
        { status: 400 }
      );
    }

    // O índice único parcial `uq_organizations_public_slug` é a garantia final
    // contra duas organizações publicando o mesmo endereço. A consulta de
    // conflito acima cobre o caso comum; se outra requisição publicar o mesmo
    // endereço entre a consulta e a gravação, o banco devolve 23505 e a resposta
    // continua sendo 409 (conflito), nunca 500.
    function savePublicCard() {
      return sql`
        UPDATE organizations
        SET
          public_slug = ${nextSlug},
          public_published = ${published},
          public_headline = ${published ? nextHeadline : null},
          public_bio = ${published ? nextBio : null},
          public_instagram = ${published ? nextInstagram : null},
          public_whatsapp = ${published ? nextWhatsapp : null},
          public_maps_url = ${published ? nextMapsUrl : null},
          ${support.accent ? sql`public_accent = COALESCE(${nextAccent}, public_accent),` : sql``}
          updated_at = NOW()
        WHERE id = ${organizationId}
        RETURNING
          name,
          public_slug,
          public_published,
          public_headline,
          public_bio,
          public_instagram,
          public_whatsapp,
          public_maps_url,
          (logo_image IS NOT NULL) AS has_logo,
          logo_updated_at
          ${support.accent ? sql`, public_accent` : sql`, NULL::varchar(20) AS public_accent`}
          ${support.cover ? sql`, (public_cover_image IS NOT NULL) AS has_cover, public_cover_updated_at` : sql`, FALSE AS has_cover, NULL::timestamptz AS public_cover_updated_at`}
      `;
    }

    let result;
    try {
      result = await savePublicCard();
    } catch (error) {
      if (isUniqueViolation(error)) {
        return Response.json(
          { error: "Este endereço já está em uso. Escolha outro." },
          { status: 409 }
        );
      }
      throw error;
    }

    if (result.length === 0) {
      return Response.json({ error: "ORGANIZATION_NOT_FOUND" }, { status: 404 });
    }

    return Response.json({
      ...toConfig(result[0] as PublicCardRow),
      accentSupported: support.accent,
      coverSupported: support.cover,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Update public card config error:", error);
    return Response.json(
      { error: "Não foi possível salvar as configurações do cartão." },
      { status: 500 }
    );
  }
}
