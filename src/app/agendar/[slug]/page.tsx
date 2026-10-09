import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandMark } from "@/app/brand-mark";
import {
  getPublishedOrganizationBySlug,
  getPublicProcedures,
  getPublicProfessionals,
} from "@/lib/public/profile";
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

  const [procedures, professionals] = await Promise.all([
    getPublicProcedures(organization.id),
    getPublicProfessionals(organization.id),
  ]);

  const location = [organization.city, organization.state]
    .filter(Boolean)
    .join(" · ");
  const instagramHandle = organization.instagram?.replace(/^@/, "").trim();

  return (
    <main className="min-h-screen bg-[#f6faf7] px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <header className="rounded-3xl border border-[#e2ebe5] bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a9f8d]">
                Agendamento online
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#30463c]">
                {organization.name}
              </h1>
              {organization.headline ? (
                <p className="mt-2 text-lg text-[#496458]">
                  {organization.headline}
                </p>
              ) : null}
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dceee4]">
              <BrandMark className="h-6 w-6" />
            </span>
          </div>

          {organization.bio ? (
            <p className="mt-5 whitespace-pre-line text-sm leading-6 text-[#6d7d75]">
              {organization.bio}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#6d7d75]">
            {location ? <span>📍 {location}</span> : null}
            {instagramHandle ? (
              <a
                href={`https://instagram.com/${instagramHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#496458] underline-offset-2 transition hover:underline"
              >
                @{instagramHandle}
              </a>
            ) : null}
          </div>
        </header>

        <div className="mt-8">
          {procedures.length === 0 ? (
            <p className="rounded-3xl border border-[#e2ebe5] bg-white p-6 text-sm text-[#6d7d75]">
              Este cartão ainda não tem procedimentos disponíveis para
              agendamento online.
            </p>
          ) : (
            <PublicBookingForm
              slug={organization.slug}
              procedures={procedures as PublicProcedureOption[]}
              professionals={professionals as PublicProfessionalOption[]}
              whatsappDigits={whatsappDigits(organization.businessPhone)}
            />
          )}
        </div>

        <p className="mt-8 text-center text-xs tracking-wider text-[#8a9892]">
          Agendamento online via EstetiQI
        </p>
      </div>
    </main>
  );
}
