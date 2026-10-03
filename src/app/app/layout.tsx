"use client";

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { signOut } = useClerk();
  const pathname = usePathname();
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("EstetiQi");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/organization")
      .then((response) => response.json())
      .then((data) => {
        if (data?.name) setOrganizationName(data.name);

        if (
          data?.onboarding_completed === false &&
          pathname !== "/app/onboarding"
        ) {
          router.replace("/app/onboarding");
        }
      })
      .catch(() => {});
  }, [pathname, router]);

  return (
    <div className="min-h-screen bg-[#fbfaf8] text-[#26352f]">
      <header className="border-b border-[#e4ebe7] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <Link href="/app" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1f5f2] text-sm text-[#7a9f8d]">
              ✦
            </div>

            <div>
              <div className="text-lg font-semibold text-[#30463c]">
                {organizationName}
              </div>

              <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#a0aaa5]">
                EstetiQi
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-5 text-sm text-[#66756d]">
              <Link
                href="/app"
                className={pathname === "/app" ? "font-semibold text-[#30463c]" : ""}
              >
                Dashboard
              </Link>

              <Link
                href="/app/clientes"
                className={pathname.startsWith("/app/clientes") ? "font-semibold text-[#30463c]" : ""}
              >
                Clientes
              </Link>

              <Link
                href="/app/agenda"
                className={pathname.startsWith("/app/agenda") ? "font-semibold text-[#30463c]" : ""}
              >
                Agenda
              </Link>

              <Link
                href="/app/procedimentos"
                className={pathname.startsWith("/app/procedimentos") ? "font-semibold text-[#30463c]" : ""}
              >
                Procedimentos
              </Link>

              <Link
                href="/app/inteligencia"
                className={pathname.startsWith("/app/inteligencia") ? "font-semibold text-[#30463c]" : ""}
              >
                Inteligência
              </Link>

              <Link
                href="/app/campanhas"
                className={pathname.startsWith("/app/campanhas") ? "font-semibold text-[#30463c]" : ""}
              >
                Campanhas
              </Link>
            </nav>

            <div className="relative">
              <button
                type="button"
                aria-label="Abrir menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#dfe9e3] text-xl leading-none text-[#66756d] transition hover:bg-[#f4f7f5]"
              >
                ⋮
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-12 z-50 w-52 rounded-xl border border-[#e4ebe7] bg-white p-2 shadow-lg">
                  <Link
                    href="/app/financeiro"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-[#46574f] hover:bg-[#f4f7f5]"
                  >
                    Financeiro
                  </Link>

                  <Link
                    href="/app/configuracoes"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-[#46574f] hover:bg-[#f4f7f5]"
                  >
                    Configurações
                  </Link>

                  <Link
                    href="/app/integracoes"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-[#46574f] hover:bg-[#f4f7f5]"
                  >
                    Integrações
                  </Link>

                  <Link
                    href="/app/conta"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-[#46574f] hover:bg-[#f4f7f5]"
                  >
                    Minha conta
                  </Link>

                  <div className="my-1 border-t border-[#e4ebe7]" />

                  <button
                    type="button"
                    onClick={() => signOut({ redirectUrl: "/login" })}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#8a5149] hover:bg-[#faf2f0]"
                  >
                    Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
