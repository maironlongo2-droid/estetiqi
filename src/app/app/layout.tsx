"use client";

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "../brand-mark";
import { ToastProvider } from "./toast";
import { getProcedureLabels } from "@/lib/business/procedure-labels";
import { ProcedureLabelsProvider } from "./procedure-labels";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { signOut } = useClerk();
  const pathname = usePathname();
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("EstetiQi");
  // Tipo de negócio da organização (ex.: "Estética", "Salão"). Decide apenas os
  // rótulos de apresentação (procedimentos x serviços) e vem da mesma carga de
  // /api/organization — sem consulta adicional.
  const [businessType, setBusinessType] = useState<string | null>(null);
  // Indica se o usuário logado é o administrador da plataforma. Controla apenas
  // a exibição do atalho para a central de suporte; a autorização real é
  // validada no servidor pelas APIs de /api/admin/support/*.
  const [isSupportAdmin, setIsSupportAdmin] = useState(false);
  // Organização bloqueada pela administração da plataforma. A restrição real é
  // aplicada no servidor (todas as APIs respondem 403); aqui só exibimos a
  // mensagem adequada ao usuário.
  const [organizationBlocked, setOrganizationBlocked] = useState(false);
  // Cada menu (grupo do topo, navegação do celular ou "Mais opções") só conta
  // como aberto na página em que foi aberto: navegar o fecha automaticamente.
  const [openMenu, setOpenMenu] = useState<{
    path: string;
    key: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Estado do menu "Mais opções" (⋮), derivado do menu aberto.
  const menuOpen = openMenu?.path === pathname && openMenu.key === "more";
  const setMenuOpen = (open: boolean) =>
    setOpenMenu(open ? { path: pathname, key: "more" } : null);

  // Grupo do topo atualmente aberto (desktop) e alternância do submenu.
  const openGroupKey = openMenu?.path === pathname ? openMenu.key : null;
  const toggleGroup = (key: string) =>
    setOpenMenu((current) =>
      current?.path === pathname && current.key === key
        ? null
        : { path: pathname, key }
    );
  const closeMenu = () => setOpenMenu(null);
  const anyMenuOpen = openMenu !== null;

  // Comportamento de hover do menu superior (notebook/desktop). Só é aplicado em
  // dispositivos com ponteiro de precisão (mouse/trackpad); no celular o clique
  // continua sendo o único mecanismo, preservando a navegação móvel.
  const [canHoverGroup, setCanHoverGroup] = useState(false);
  // Pequeno atraso ao sair evita que o submenu pisque ao cruzar o vão entre o
  // botão e os itens, ou ao passar diretamente de um grupo para outro.
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHoverGroup(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    };
  }, []);

  // Abre o submenu ao passar o mouse e cancela qualquer fechamento pendente,
  // para o submenu acompanhar o cursor sem piscar na troca de grupo.
  const openGroupOnHover = (key: string) => {
    if (!canHoverGroup) return;
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    setOpenMenu({ path: pathname, key });
  };
  // Fecha o submenu ao sair da área do grupo (botão + itens), com leve atraso.
  const closeGroupOnHover = () => {
    if (!canHoverGroup) return;
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = setTimeout(() => {
      hoverCloseTimer.current = null;
      setOpenMenu(null);
    }, 200);
  };
  // No teclado, o foco revela o submenu; no toque, o clique comanda.
  const openGroupOnFocus = (key: string) => {
    if (!canHoverGroup) return;
    setOpenMenu({ path: pathname, key });
  };
  // Fecha quando o foco sai do grupo (Tab), evitando submenu preso aberto.
  const closeGroupOnBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!canHoverGroup) return;
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    setOpenMenu(null);
  };
  // Clique no grupo: em dispositivos com ponteiro o submenu já é revelado por
  // hover/foco, então o clique apenas o mantém aberto (fechar: afastar o mouse,
  // Escape ou clicar fora). Em dispositivos sem hover (toque), alterna como antes.
  const handleGroupClick = (key: string) => {
    if (!canHoverGroup) {
      toggleGroup(key);
      return;
    }
    setOpenMenu((current) =>
      current?.path === pathname && current.key === key
        ? current
        : { path: pathname, key }
    );
  };

  // Um item está ativo na rota atual ou em uma rota filha dela.
  const isRouteActive = (href: string) => {
    const base = href.split("#")[0];
    if (base === "/app") return pathname === "/app";
    return pathname === base || pathname.startsWith(`${base}/`);
  };
  // Rótulos de apresentação das ofertas usados no menu e nas telas de /app.
  const procedureLabels = getProcedureLabels(businessType);

  // Navegação organizada por grupos de uso. O grupo "Crescimento" já reserva o
  // espaço do futuro módulo Comunicação Inteligente, exibido como "em breve"
  // (sem link), para que a navegação cresça sem reestruturação.
  type NavItem = { href: string | null; label: string; soon?: boolean };
  type NavGroup = { key: string; label: string; items: NavItem[] };
  const navGroups: NavGroup[] = [
    {
      key: "overview",
      label: "Visão geral",
      items: [{ href: "/app", label: "Início" }],
    },
    {
      key: "care",
      label: "Atendimento",
      items: [
        { href: "/app/agenda", label: "Agenda" },
        { href: "/app/clientes", label: "Clientes" },
      ],
    },
    {
      key: "finance",
      label: "Financeiro",
      items: [
        { href: "/app/financeiro", label: "Financeiro" },
        { href: "/app/calculadora", label: "Calculadora de preços" },
      ],
    },
    {
      key: "growth",
      label: "Crescimento",
      items: [
        { href: "/app/inteligencia", label: "Assistente IA" },
        { href: "/app/automacoes", label: "Automações" },
        { href: null, label: "Comunicação inteligente", soon: true },
      ],
    },
    {
      key: "business",
      label: "Meu negócio",
      items: [
        { href: "/app/configuracoes#cartao-digital", label: "Cartão digital" },
        { href: "/app/profissionais", label: "Profissionais" },
        { href: "/app/procedimentos", label: procedureLabels.plural },
        { href: "/app/configuracoes", label: "Configurações" },
      ],
    },
  ];

  // Destaque do botão de navegação do celular: ativo quando a rota atual
  // pertence a algum grupo da navegação principal.
  const mobileNavActive = navGroups.some((group) =>
    group.items.some((item) => (item.href ? isRouteActive(item.href) : false))
  );
  // Destaque do menu da conta (⋮): pertence à área de suporte.
  const supportActive = pathname.startsWith("/app/suporte");
  // Menu de navegação do celular (grupos), separado das ações da conta (⋮).
  const navOpen = openMenu?.path === pathname && openMenu.key === "nav";
  const setNavOpen = (open: boolean) =>
    setOpenMenu(open ? { path: pathname, key: "nav" } : null);

  // O menu de navegação do celular só monta os itens "Assistente IA" e
  // "Automações" quando é aberto, e esses links não ficam na barra principal do
  // celular. Como o prefetch automático do <Link> só dispara com o link montado
  // e visível (viewport/hover), as duas rotas ficam "frias" até o primeiro
  // toque. Pré-carregamos uma única vez na montagem do layout para o primeiro
  // toque no menu responder sem espera. (O Next.js desativa o prefetch em
  // desenvolvimento; o ganho aparece em produção.)
  const prefetchedMenuRoutes = useRef(false);
  useEffect(() => {
    if (prefetchedMenuRoutes.current) return;
    prefetchedMenuRoutes.current = true;
    router.prefetch("/app/inteligencia");
    router.prefetch("/app/automacoes");
  }, [router]);

  // Consulta uma única vez por sessão do layout se o usuário pode acessar a
  // central de suporte. Sem allowlist configurada no servidor, a resposta é
  // sempre { admin: false } e nenhum atalho aparece.
  useEffect(() => {
    let active = true;

    fetch("/api/admin/support/access")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.admin === true) {
          setIsSupportAdmin(true);
        }
      })
      .catch(() => {
        // O atalho é opcional: uma falha não afeta o restante do app.
      });

    return () => {
      active = false;
    };
  }, []);

  // Consulta uma única vez por sessão se a organização está bloqueada. A
  // restrição real é aplicada no servidor; aqui apenas exibimos a mensagem.
  useEffect(() => {
    let active = true;

    fetch("/api/auth/context")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.organizationBlocked === true) {
          setOrganizationBlocked(true);
        }
      })
      .catch(() => {
        // Se a verificação falhar, não bloqueamos a interface indevidamente.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!anyMenuOpen) return;

    function closeOnOutsidePress(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      setOpenMenu(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("touchstart", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("touchstart", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [anyMenuOpen]);

  // A organização é carregada uma única vez por sessão do layout e reutilizada
  // durante a navegação interna do /app, evitando uma chamada extra (com auth +
  // consulta ao banco) a cada troca de rota. Enquanto o onboarding estiver
  // pendente, revalidamos ao sair da tela de onboarding para confirmar se o
  // cadastro foi concluído (mantém o nome atualizado e o redirect correto).
  const organizationCache = useRef<{
    loaded: boolean;
    onboardingPending: boolean;
  }>({ loaded: false, onboardingPending: false });

  useEffect(() => {
    const cache = organizationCache.current;
    const needsOnboardingCheck =
      cache.onboardingPending && pathname !== "/app/onboarding";

    if (cache.loaded && !needsOnboardingCheck) return;

    fetch("/api/organization")
      .then((response) => response.json())
      .then((data) => {
        cache.loaded = true;
        cache.onboardingPending = data?.onboarding_completed === false;

        if (data?.name) setOrganizationName(data.name);

        setBusinessType(
          typeof data?.business_type === "string" ? data.business_type : null
        );

        if (cache.onboardingPending && pathname !== "/app/onboarding") {
          router.replace("/app/onboarding");
        }
      })
      .catch(() => {});
  }, [pathname, router]);

  // Quando o nome do negócio é alterado em /app/configuracoes, o header é
  // atualizado imediatamente, sem refazer a chamada de carga nem remover o cache.
  useEffect(() => {
    function handleOrganizationUpdated(event: Event) {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) setOrganizationName(detail.name);
    }

    window.addEventListener(
      "estetiqi:organization-updated",
      handleOrganizationUpdated,
    );

    return () =>
      window.removeEventListener(
        "estetiqi:organization-updated",
        handleOrganizationUpdated,
      );
  }, []);

  if (organizationBlocked) {
    return (
      <main className="app-min-h flex min-h-screen items-center justify-center bg-[#fbfaf8] px-6 py-16 text-[#26352f]">
        <div className="w-full max-w-md rounded-3xl border border-[#e4ebe7] bg-white p-8 text-center shadow-[0_20px_60px_rgba(64,91,78,0.08)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fdeceb]">
            <BrandMark className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-[#30463c]">
            Acesso temporariamente bloqueado
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#66756d]">
            A organização está bloqueada. Seus dados estão preservados. Fale com
            o suporte da EstetiQI para reativar o acesso.
          </p>
          <a
            href="mailto:contato@estetiqi.com.br"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#25382f]"
          >
            Falar com o suporte
          </a>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void signOut({ redirectUrl: "/" })}
              className="text-sm font-medium text-[#66756d] underline-offset-2 hover:underline"
            >
              Sair da conta
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="app-min-h bg-[#fbfaf8] text-[#26352f] pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] lg:pb-0">
      <header className="border-b border-[#e4ebe7] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/app" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf3ef]">
              <BrandMark className="h-6 w-6" />
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

          <div
            ref={menuRef}
            className="flex min-w-0 items-center justify-end gap-2 lg:gap-5"
          >
            <nav
              aria-label="Navegação principal"
              className="hidden min-w-0 flex-1 items-center gap-1 text-sm text-[#66756d] lg:flex lg:flex-initial"
            >
              {navGroups.map((group) => {
                const groupActive = group.items.some((item) =>
                  item.href ? isRouteActive(item.href) : false
                );
                const singleItem =
                  group.items.length === 1 ? group.items[0] : undefined;

                if (singleItem && singleItem.href) {
                  const active = isRouteActive(singleItem.href);
                  return (
                    <Link
                      key={group.key}
                      href={singleItem.href}
                      aria-current={active ? "page" : undefined}
                      className={`min-w-0 rounded-lg px-2 py-2 text-center text-xs font-medium leading-tight transition hover:bg-[#f4f7f5] hover:text-[#30463c] sm:px-2 lg:shrink-0 lg:px-3 lg:text-sm ${
                        active
                          ? "bg-[#edf3ef] font-semibold text-[#30463c]"
                          : ""
                      }`}
                    >
                      {singleItem.label}
                    </Link>
                  );
                }

                const open = openGroupKey === group.key;
                return (
                  <div
                    key={group.key}
                    className="relative lg:shrink-0"
                    onMouseEnter={() => openGroupOnHover(group.key)}
                    onMouseLeave={closeGroupOnHover}
                    onFocus={() => openGroupOnFocus(group.key)}
                    onBlur={closeGroupOnBlur}
                  >
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={open}
                      onClick={() => handleGroupClick(group.key)}
                      className={`flex items-center gap-1 rounded-lg px-2 py-2 text-center text-xs font-medium leading-tight transition hover:bg-[#f4f7f5] hover:text-[#30463c] sm:px-2 lg:px-3 lg:text-sm ${
                        groupActive
                          ? "bg-[#edf3ef] font-semibold text-[#30463c]"
                          : ""
                      }`}
                    >
                      {group.label}
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className={`h-3.5 w-3.5 transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>

                    {open && (
                      <div
                        role="menu"
                        aria-label={group.label}
                        className="absolute left-0 top-full z-50 w-56 max-w-[calc(100vw-1rem)] rounded-xl border border-[#e4ebe7] bg-white p-2 shadow-lg"
                      >
                        {group.items.map((item) =>
                          item.href ? (
                            <Link
                              key={item.label}
                              role="menuitem"
                              href={item.href}
                              onClick={closeMenu}
                              aria-current={
                                isRouteActive(item.href) ? "page" : undefined
                              }
                              className="flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-[#50655b] hover:bg-[#f4f7f5]"
                            >
                              {item.label}
                            </Link>
                          ) : (
                            <span
                              key={item.label}
                              aria-disabled="true"
                              className="flex min-h-10 cursor-not-allowed items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#8a9891]"
                            >
                              {item.label}
                              <span className="rounded-full bg-[#f1f4f2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                em breve
                              </span>
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* No celular, a navegação principal (5 grupos) fica em um menu
                dedicado, separado das ações da conta (⋮). */}
            <div className="relative shrink-0 lg:hidden">
              <button
                type="button"
                aria-label="Abrir navegação"
                aria-haspopup="menu"
                aria-expanded={navOpen}
                onClick={() => setNavOpen(!navOpen)}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#dfe9e3] text-[#66756d] transition hover:bg-[#f4f7f5] ${
                  mobileNavActive ? "bg-[#edf3ef] text-[#30463c]" : ""
                }`}
              >
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>

              {navOpen && (
                <div
                  role="menu"
                  aria-label="Menu de navegação"
                  className="absolute right-0 top-12 z-50 max-h-[min(80vh,34rem)] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[#e4ebe7] bg-white p-2 shadow-lg"
                >
                  {navGroups.map((group) => (
                    <div key={group.key} className="py-1">
                      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a9891]">
                        {group.label}
                      </p>
                      {group.items.map((item) =>
                        item.href ? (
                          <Link
                            key={item.label}
                            role="menuitem"
                            href={item.href}
                            onClick={closeMenu}
                            aria-current={
                              isRouteActive(item.href) ? "page" : undefined
                            }
                            className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-[#50655b] hover:bg-[#f4f7f5]"
                          >
                            {item.label}
                          </Link>
                        ) : (
                          <span
                            key={item.label}
                            aria-disabled="true"
                            className="flex min-h-11 cursor-not-allowed items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#8a9891]"
                          >
                            {item.label}
                            <span className="rounded-full bg-[#f1f4f2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                              em breve
                            </span>
                          </span>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative ml-auto shrink-0">
              <button
                type="button"
                aria-label="Mais opções"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#dfe9e3] text-xl leading-none text-[#66756d] transition hover:bg-[#f4f7f5] ${
                  supportActive ? "bg-[#edf3ef] text-[#30463c]" : ""
                }`}
              >
                ⋮
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Mais opções"
                  className="absolute right-0 top-12 z-50 max-h-[min(80vh,34rem)] w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[#e4ebe7] bg-white p-2 shadow-lg"
                >
                  <Link
                    role="menuitem"
                    href="/app/suporte"
                    onClick={() => setMenuOpen(false)}
                    aria-current={pathname.startsWith("/app/suporte") ? "page" : undefined}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#50655b] hover:bg-[#f4f7f5]"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9.6 9.4a2.4 2.4 0 1 1 3.7 2.1c-.8.5-1.3 1-1.3 1.8v.2" />
                      <path d="M12 16.4h.01" />
                    </svg>
                    Ajuda e suporte
                  </Link>

                  {isSupportAdmin && (
                    <>
                      <Link
                        role="menuitem"
                        href="/admin/painel"
                        onClick={() => setMenuOpen(false)}
                        className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#50655b] hover:bg-[#f4f7f5]"
                      >
                        Painel da plataforma (EstetiQi)
                      </Link>
                      <Link
                        role="menuitem"
                        href="/admin/suporte"
                        onClick={() => setMenuOpen(false)}
                        className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#50655b] hover:bg-[#f4f7f5]"
                      >
                        Central de suporte (EstetiQi)
                      </Link>
                    </>
                  )}

                  <div className="my-1 border-t border-[#e4ebe7]" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void signOut({ redirectUrl: "/" });
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

      <ToastProvider>
        <ProcedureLabelsProvider businessType={businessType}>
          {children}
        </ProcedureLabelsProvider>
      </ToastProvider>

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
