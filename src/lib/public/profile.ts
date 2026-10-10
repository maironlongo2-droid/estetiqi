import { sql } from "@/lib/db/client";
import {
  resolvePublicAccent,
  type PublicAccent,
} from "@/lib/public/accent";

// Dados públicos do cartão digital. Somente leitura e apenas o necessário para
// a página pública: nunca expõe dados administrativos, financeiros ou de
// outros clientes.

export type PublicOrganization = {
  id: string;
  name: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  instagram: string | null;
  whatsapp: string | null;
  mapsUrl: string | null;
  businessPhone: string | null;
  city: string | null;
  state: string | null;
  businessType: string | null;
  hasLogo: boolean;
  logoVersion: number | null;
  hasCover: boolean;
  coverVersion: number | null;
  // Chave validada da paleta fechada (nunca CSS vindo do banco).
  accent: PublicAccent;
};

export type PublicProcedure = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  durationMinutes: number | null;
};

export type PublicProfessional = {
  id: string;
  name: string;
  specialty: string | null;
  procedureIds: string[];
  hasPhoto: boolean;
  photoVersion: number | null;
};

// Colunas adicionadas pela migration 038 (cor de destaque e capa). Como a
// migration pode ainda não estar aplicada, a leitura pública verifica a estrutura
// antes de consultá-las: sem elas, o cartão usa a cor padrão e nenhuma capa, em
// vez de falhar.
export type PublicCardSupport = {
  accent: boolean;
  cover: boolean;
};

export async function readPublicCardSupport(): Promise<PublicCardSupport> {
  const rows = (await sql`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'organizations'
          AND column_name = 'public_accent'
      ) AS has_accent,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'organizations'
          AND column_name = 'public_cover_image'
      ) AS has_cover
  `) as { has_accent: boolean; has_cover: boolean }[];

  return {
    accent: Boolean(rows[0]?.has_accent),
    cover: Boolean(rows[0]?.has_cover),
  };
}

// Resolve a organização publicada a partir do endereço público. Cartões não
// publicados (ou inexistentes) retornam null, impedindo o acesso público.
export async function getPublishedOrganizationBySlug(
  slug: string
): Promise<PublicOrganization | null> {
  const support = await readPublicCardSupport();

  const rows = await sql`
    SELECT
      id,
      name,
      public_slug,
      public_headline,
      public_bio,
      public_instagram,
      public_whatsapp,
      public_maps_url,
      business_phone,
      city,
      state,
      business_type,
      (logo_image IS NOT NULL) AS has_logo,
      logo_updated_at,
      ${support.accent ? sql`public_accent` : sql`NULL::varchar(20) AS public_accent`},
      ${support.cover ? sql`(public_cover_image IS NOT NULL) AS has_cover` : sql`FALSE AS has_cover`},
      ${support.cover ? sql`public_cover_updated_at` : sql`NULL::timestamptz AS public_cover_updated_at`}
    FROM organizations
    WHERE LOWER(public_slug) = LOWER(${slug})
      AND public_published = TRUE
    LIMIT 1
  `;

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    id: row.id,
    name: row.name,
    slug: row.public_slug,
    headline: row.public_headline,
    bio: row.public_bio,
    instagram: row.public_instagram,
    whatsapp: row.public_whatsapp,
    mapsUrl: row.public_maps_url,
    businessPhone: row.business_phone,
    city: row.city,
    state: row.state,
    businessType: row.business_type,
    hasLogo: Boolean(row.has_logo),
    logoVersion: row.logo_updated_at
      ? new Date(row.logo_updated_at).getTime()
      : null,
    hasCover: Boolean(row.has_cover),
    coverVersion: row.public_cover_updated_at
      ? new Date(row.public_cover_updated_at).getTime()
      : null,
    // Valor inválido ou ausente no banco cai no padrão do aplicativo.
    accent: resolvePublicAccent(row.public_accent),
  };
}

// Procedimentos que podem ser agendados online: ativos e realizados por pelo
// menos um profissional ativo.
export async function getPublicProcedures(
  organizationId: string
): Promise<PublicProcedure[]> {
  const rows = await sql`
    SELECT pr.id, pr.name, pr.description, pr.price, pr.duration_minutes
    FROM procedures pr
    WHERE pr.organization_id = ${organizationId}
      AND pr.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM professional_procedures pp
        JOIN professionals prof
          ON prof.id = pp.professional_id
         AND prof.organization_id = pp.organization_id
         AND prof.active = TRUE
        WHERE pp.organization_id = pr.organization_id
          AND pp.procedure_id = pr.id
      )
    ORDER BY pr.name
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price === null ? null : Number(row.price),
    durationMinutes: row.duration_minutes,
  }));
}

// Profissionais ativos e os procedimentos (ativos) que cada um realiza.
export async function getPublicProfessionals(
  organizationId: string
): Promise<PublicProfessional[]> {
  const rows = await sql`
    SELECT
      p.id,
      p.name,
      p.specialty,
      (p.photo_image IS NOT NULL) AS has_photo,
      p.photo_updated_at,
      COALESCE(
        ARRAY_AGG(active_procedure.id)
          FILTER (WHERE active_procedure.id IS NOT NULL),
        ARRAY[]::uuid[]
      ) AS procedure_ids
    FROM professionals p
    LEFT JOIN professional_procedures pp
      ON pp.professional_id = p.id
     AND pp.organization_id = p.organization_id
    LEFT JOIN procedures active_procedure
      ON active_procedure.id = pp.procedure_id
     AND active_procedure.organization_id = pp.organization_id
     AND active_procedure.status = 'active'
    WHERE p.organization_id = ${organizationId}
      AND p.active = TRUE
    GROUP BY p.id
    ORDER BY p.name
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    procedureIds: ((row.procedure_ids as string[]) || []).filter(Boolean),
    hasPhoto: Boolean(row.has_photo),
    photoVersion: row.photo_updated_at
      ? new Date(row.photo_updated_at).getTime()
      : null,
  }));
}
