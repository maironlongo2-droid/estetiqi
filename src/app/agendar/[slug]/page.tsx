import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandMark } from "@/app/brand-mark";
import {
  getPublishedOrganizationBySlug,
  getPublicProcedures,
  getPublicProfessionals,
} from "@/lib/public/profile";
import { getProcedureLabels } from "@/lib/business/procedure-labels";
import {
  googleMapsSearchUrl,
  googleMapsUrl,
  instagramUrl,
  whatsappUrl,
} from "@/lib/public/contact-links";
import {
  PublicBookingForm,
  type PublicProcedureOption,
  type PublicProfessionalOption,
} from "./booking-form";

export const dynamic = "force-dynamic";

function whatsappDigits(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

// Ícones oficiais dos contatos (SVG inline, sem dependência externa). São
// decorativos; o rótulo acessível fica no <a> que os envolve.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="#25D366"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="#E1306C"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 01-2.88 0 1.44 1.44 0 012.88 0z" />
    </svg>
  );
}

function MapsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="#EA4335"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
    </svg>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const organization = await getPublishedOrganizationBySlug(slug);

  if (!organization) {
    return { title: "Cartão não encontrado · EstetiQI" };
  }

  return {
    title: `${organization.name} · Agende seu horário`,
    description:
      organization.headline ??
      `Agende seu horário com ${organization.name} de forma simples e online.`,
  };
}

// Página pública do cartão digital. Não exige login: o visitante escolhe os
// procedimentos, o profissional e um horário realmente disponível.
export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const organization = await getPublishedOrganizationBySlug(slug);

  if (!organization) {
    notFound();
  }

  const labels = getProcedureLabels(organization.businessType);

  const [procedures, professionals] = await Promise.all([
    getPublicProcedures(organization.id),
    getPublicProfessionals(organization.id),
  ]);

  const location = [organization.city, organization.state]
    .filter(Boolean)
    .join(" · ");
  const address = [organization.city, organization.state]
    .filter(Boolean)
    .join(", ");
  // Somente links válidos são gerados; campos vazios nunca aparecem no cartão.
  const instagramHref = instagramUrl(organization.instagram);
  const whatsappHref = whatsappUrl(organization.whatsapp);
  const mapsHref =
    googleMapsUrl(organization.mapsUrl) ?? googleMapsSearchUrl(address);

  return (
    <main className="min-h-screen bg-[#f6f3ec] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-xl lg:max-w-5xl">
        <div className="lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <header className="rounded-[1.75rem] border border-[#e7e1d5] bg-white p-6 shadow-[0_1px_2px_rgba(47,58,52,0.04)] sm:p-7 lg:sticky lg:top-8">
            <div className="flex items-center gap-4">
              {organization.hasLogo ? (
                // A logo mantém a proporção original (object-contain) e é
                // exibida sem moldura, borda ou fundo que pudesse parecer um
                // contorno ao redor da imagem.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/public/${organization.slug}/logo${
                    organization.logoVersion
                      ? `?v=${organization.logoVersion}`
                      : ""
                  }`}
                  alt={`Logo de ${organization.name}`}
                  className="h-16 w-16 shrink-0 object-contain sm:h-20 sm:w-20"
                />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#eaf1ec] sm:h-20 sm:w-20">
                  <BrandMark className="h-9 w-9 sm:h-11 sm:w-11" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a9a90]">
                  Agendamento online
                </p>
                <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-[#2f3a34] sm:text-[1.75rem]">
                  {organization.name}
                </h1>
              </div>
            </div>

            {organization.headline ? (
              <p className="mt-4 text-base leading-6 text-[#496458]">
                {organization.headline}
              </p>
            ) : null}

            {organization.bio ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#5f6f68]">
                {organization.bio}
              </p>
            ) : null}

            {location ? (
              <div className="mt-5">
                <div className="h-px w-12 bg-[#d8c69b]" />
                <p className="mt-3 flex items-center gap-1.5 text-sm text-[#5f6f68]">
                  <span aria-hidden="true">📍</span>
                  <span>{location}</span>
                </p>
              </div>
            ) : null}

            {whatsappHref || instagramHref || mapsHref ? (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-[#efe9dd] pt-5">
                {whatsappHref ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Falar no WhatsApp"
                    className="inline-flex items-center gap-2 rounded-full bg-[#f4f1e9] px-3.5 py-2 text-xs font-medium text-[#45534c] transition hover:bg-[#ece7db]"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    <span>WhatsApp</span>
                  </a>
                ) : null}
                {instagramHref ? (
                  <a
                    href={instagramHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Abrir Instagram"
                    className="inline-flex items-center gap-2 rounded-full bg-[#f4f1e9] px-3.5 py-2 text-xs font-medium text-[#45534c] transition hover:bg-[#ece7db]"
                  >
                    <InstagramIcon className="h-4 w-4" />
                    <span>Instagram</span>
                  </a>
                ) : null}
                {mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Abrir no Google Maps"
                    className="inline-flex items-center gap-2 rounded-full bg-[#f4f1e9] px-3.5 py-2 text-xs font-medium text-[#45534c] transition hover:bg-[#ece7db]"
                  >
                    <MapsIcon className="h-4 w-4" />
                    <span>Como chegar</span>
                  </a>
                ) : null}
              </div>
            ) : null}
          </header>

          <div className="mt-6 lg:mt-0">
            {procedures.length === 0 ? (
              <p className="rounded-[1.75rem] border border-[#e7e1d5] bg-white p-6 text-sm text-[#5f6f68]">
                Este cartão ainda não tem {labels.pluralLower} disponíveis para
                agendamento online.
              </p>
            ) : (
              <PublicBookingForm
                slug={organization.slug}
                procedures={procedures as PublicProcedureOption[]}
                professionals={professionals as PublicProfessionalOption[]}
                whatsappDigits={whatsappDigits(organization.businessPhone)}
                businessType={organization.businessType}
              />
            )}
          </div>
        </div>

        <footer className="mx-auto mt-10 max-w-md text-center">
          <div className="mx-auto h-px w-10 bg-[#ddd3c0]" />
          <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-[#9aa39d]">
            Experiência de agendamento com EstetiQI
          </p>
          <p className="mt-2 text-xs text-[#8a948e]">
            <a
              href="mailto:contato@estetiqi.com.br"
              className="font-medium text-[#5f7568] underline-offset-2 transition hover:underline"
            >
              contato@estetiqi.com.br
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
