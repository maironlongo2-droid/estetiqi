"use client";

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ToastProvider } from "./toast";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { signOut } = useClerk();
  const pathname = usePathname();
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("EstetiQi");
  // O menu só conta como aberto na página em que foi aberto: navegar o fecha.
  const [menuOpenPath, setMenuOpenPath] = useState<string | null>(null);
  const menuOpen = menuOpenPath === pathname;
  const menuRef = useRef<HTMLDivElement>(null);
  const setMenuOpen = (open: boolean) => setMenuOpenPath(open ? pathname : null);
  const settingsActive =
    pathname.startsWith("/app/profissionais") ||
    pathname.startsWith("/app/procedimentos") ||
    pathname.startsWith("/app/calculadora");
  // No celular, Assistente IA e Automações ficam dentro do menu "Mais".
  const mobileSecondaryActive =
    pathname.startsWith("/app/inteligencia") ||
    pathname.startsWith("/app/automacoes");

  useEffect(() => {
    if (!menuOpen) return;

    function closeOnOutsidePress(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      setMenuOpenPath(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpenPath(null);
    }

    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("touchstart", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("touchstart", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

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
    <div className="app-min-h bg-[#fbfaf8] text-[#26352f] pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] lg:pb-0">
      <header className="border-b border-[#e4ebe7] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/app" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf3ef] text-sm text-[#527765]">
              ✦
            </div>

            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-[#30463c]">
                {organizationName}
              </div>

              <div className="text-[9px] font-medium uppercase tracking-[0.2em] text-[#8a9891]">
                EstetiQi
              </div>
            </div>
          </Link>

          <div className="flex min-w-0 items-center justify-end gap-2 lg:gap-5">
            <nav
              aria-label="Navegação principal"
              className="hidden min-w-0 flex-1 items-center gap-1 text-sm text-[#66756d] lg:flex lg:flex-initial"
            >
              {[
                { href: "/app", label: "Início", active: pathname === "/app" },
                {
                  href: "/app/clientes",
                  label: "Clientes",
                  active: pathname.startsWith("/app/clientes"),
                },
                {
                  href: "/app/agenda",
                  label: "Agenda",
                  active: pathname.startsWith("/app/agenda"),
                },
                {
                  href: "/app/financeiro",
                  label: "Financeiro",
                  active: pathname.startsWith("/app/financeiro"),
                },
                {
                  href: "/app/inteligencia",
                  label: "Assistente IA",
                  active: pathname.startsWith("/app/inteligencia"),
                  desktopOnly: true,
                },
                {
                  href: "/app/automacoes",
                  label: "Automações",
                  active: pathname.startsWith("/app/automacoes"),
                  desktopOnly: true,
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`min-w-0 rounded-lg px-1 py-2 text-center text-xs font-medium leading-tight transition hover:bg-[#f4f7f5] hover:text-[#30463c] sm:px-2 lg:shrink-0 lg:px-3 lg:text-sm ${
                    item.desktopOnly ? "hidden lg:block" : ""
                  } ${
                    item.active
                      ? "bg-[#edf3ef] font-semibold text-[#30463c]"
                      : ""
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div ref={menuRef} className="relative ml-auto shrink-0">
              <button
                type="button"
                aria-label="Mais opções"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#dfe9e3] text-xl leading-none text-[#66756d] transition hover:bg-[#f4f7f5] ${
                  settingsActive ? "bg-[#edf3ef] text-[#30463c]" : ""
                } ${
                  mobileSecondaryActive
                    ? "max-lg:bg-[#edf3ef] max-lg:text-[#30463c]"
                    : ""
                }`}
              >
                ⋮
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Mais opções"
                  className="absolute right-0 top-12 z-50 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-[#e4ebe7] bg-white p-2 shadow-lg"
                >
                  {[
                    {
                      href: "/app/inteligencia",
                      label: "Assistente IA",
                      mobileOnly: true,
                    },
                    {
                      href: "/app/automacoes",
                      label: "Automações",
                      mobileOnly: true,
                    },
                    { href: "/app/profissionais", label: "Profissionais" },
                    { href: "/app/procedimentos", label: "Procedimentos" },
                    { href: "/app/calculadora", label: "Calculadora de preços" },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      role="menuitem"
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                      className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-[#50655b] hover:bg-[#f4f7f5] ${
                        item.mobileOnly ? "lg:hidden" : ""
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <div className="my-1 border-t border-[#e4ebe7]" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void signOut({ redirectUrl: "/login" });
                    }}
                    role="menuitem"
                    className="flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left text-sm text-[#8a5149] hover:bg-[#faf2f0]"
                  >
                    Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <ToastProvider>{children}</ToastProvider>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[#e4ebe7] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto flex w-full max-w-7xl items-stretch px-1">
          {[
            {
              href: "/app",
              label: "Início",
              active: pathname === "/app",
              icon: (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
                  <path d="M9.5 21v-6h5v6" />
                </svg>
              ),
            },
            {
              href: "/app/agenda",
              label: "Agenda",
              active: pathname.startsWith("/app/agenda"),
              icon: (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
                  <path d="M3.5 9.5h17" />
                  <path d="M8 3v4M16 3v4" />
                </svg>
              ),
            },
            {
              href: "/app/clientes",
              label: "Clientes",
              active: pathname.startsWith("/app/clientes"),
              icon: (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <circle cx="9" cy="8" r="3.2" />
                  <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
                  <path d="M16 5.2a3 3 0 0 1 0 5.6" />
                  <path d="M17.5 14.3A5.5 5.5 0 0 1 20.5 19" />
                </svg>
              ),
            },
            {
              href: "/app/financeiro",
              label: "Financeiro",
              active: pathname.startsWith("/app/financeiro"),
              icon: (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <rect x="3" y="6.5" width="18" height="11" rx="2.5" />
                  <circle cx="12" cy="12" r="2.4" />
                  <path d="M6.5 9.5v5M17.5 9.5v5" />
                </svg>
              ),
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={item.active ? "page" : undefined}
              className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center transition ${
                item.active ? "text-[#30463c]" : "text-[#66756d]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                  item.active ? "bg-[#edf3ef]" : ""
                }`}
              >
                {item.icon}
              </span>
              <span
                className={`text-[10px] leading-none ${
                  item.active ? "font-semibold" : "font-medium"
                }`}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
