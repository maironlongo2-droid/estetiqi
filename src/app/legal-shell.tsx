import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "./brand-mark";

// Estrutura visual compartilhada das páginas legais públicas (Política de
// Privacidade e Termos de Serviço). Reaproveita a identidade da landing page
// (mesma tipografia, cores, raios e a marca `BrandMark`) para que as páginas
// legais façam parte do mesmo produto — sem criar um segundo site nem um
// layout duplicado.
//
// Este arquivo é um Server Component: as páginas legais são estáticas, não
// consultam banco, organização autenticada nem sessão, e por isso ficam
// acessíveis sem login.

// Canais de contato JÁ usados no produto: rodapé da landing page, rodapé do
// cartão público de agendamento, painel de suporte e notificação interna de
// solicitações. Nenhum endereço novo é inventado aqui.
export const LEGAL_CONTACT_EMAIL = "contato@estetiqi.com.br";
export const LEGAL_SUPPORT_EMAIL = "suporte@estetiqi.com.br";

// Data de publicação/atualização dos documentos legais. Revisar sempre que o
// conteúdo for alterado de forma relevante.
export const LEGAL_UPDATED_AT = "10 de outubro de 2026";
export const LEGAL_UPDATED_AT_ISO = "2026-10-10";

// Estilo do corpo dos documentos (parágrafos, listas, negritos e links) em um
// único lugar, para que ambos os documentos fiquem idênticos e consistentes.
const legalProse =
  "mt-3 space-y-3 text-sm leading-6 text-[#496458] [&_a]:font-medium [&_a]:text-[#3b6a58] [&_a]:underline [&_a]:underline-offset-2 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-[#30463c] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5";

const navLinkClass = "text-sm text-[#6d7d75] transition hover:text-[#30463c]";

export function LegalShell({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-[#fbfaf8]">
      <header className="border-b border-[#e8eeea] px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3" aria-label="EstetiQI">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#dceee4]">
              <BrandMark className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold tracking-[0.12em] text-[#30463c]">
              Esteti<span className="text-[#7a9f8d]">Qi</span>
            </span>
          </Link>

          <nav
            aria-label="Documentos legais"
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            <Link href="/privacidade" className={navLinkClass}>
              Política de Privacidade
            </Link>
            <Link href="/termos" className={navLinkClass}>
              Termos de Serviço
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-[#496458] transition hover:text-[#30463c]"
            >
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7a9f8d]">
          EstetiQI
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#30463c]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#496458]">{summary}</p>
        <p className="mt-4 text-xs text-[#8a9892]">
          Última atualização:{" "}
          <time dateTime={LEGAL_UPDATED_AT_ISO}>{LEGAL_UPDATED_AT}</time>
        </p>

        <div className="mt-10 space-y-8">{children}</div>
      </main>

      <footer className="border-t border-[#e8eeea] px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="text-sm font-semibold tracking-[0.12em] text-[#30463c]"
            aria-label="EstetiQI — página inicial"
          >
            Esteti<span className="text-[#7a9f8d]">Qi</span>
          </Link>

          <nav
            aria-label="Navegação do rodapé"
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            <Link href="/privacidade" className={navLinkClass}>
              Privacidade
            </Link>
            <Link href="/termos" className={navLinkClass}>
              Termos
            </Link>
            <Link href="/#recursos" className={navLinkClass}>
              Recursos
            </Link>
            <Link href="/#beneficios" className={navLinkClass}>
              Benefícios
            </Link>
          </nav>
        </div>

        <p className="mx-auto mt-6 max-w-3xl text-xs text-[#8a9892]">
          Contato:{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-medium text-[#496458] underline underline-offset-2"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
      </footer>
    </div>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold tracking-tight text-[#30463c]">
        {title}
      </h2>
      <div className={legalProse}>{children}</div>
    </section>
  );
}
