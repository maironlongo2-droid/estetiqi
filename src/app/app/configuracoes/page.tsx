"use client";

import { FormEvent, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useToast } from "../toast";

// Evento consumido por src/app/app/layout.tsx para atualizar o nome do negócio
// exibido no header sem refazer a chamada de carga nem remover o cache.
const ORGANIZATION_UPDATED_EVENT = "estetiqi:organization-updated";

export default function ConfiguracoesPage() {
  const { notifyError, notifySuccess } = useToast();
  const { user, isLoaded: userLoaded } = useUser();

  const [loading, setLoading] = useState(true);
  const [canEditOrganization, setCanEditOrganization] = useState(false);

  const [organizationName, setOrganizationName] = useState("");
  const [savingOrganization, setSavingOrganization] = useState(false);

  const [firstNameDraft, setFirstNameDraft] = useState<string | null>(null);
  const [lastNameDraft, setLastNameDraft] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [cardLoading, setCardLoading] = useState(true);
  const [cardPublished, setCardPublished] = useState(false);
  const [cardSlug, setCardSlug] = useState("");
  const [cardSuggestedSlug, setCardSuggestedSlug] = useState("");
  const [cardHeadline, setCardHeadline] = useState("");
  const [cardBio, setCardBio] = useState("");
  const [cardInstagram, setCardInstagram] = useState("");
  const [savingCard, setSavingCard] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/organization").then((response) => response.json()),
      fetch("/api/auth/me").then((response) => response.json()),
    ])
      .then(([organization, account]) => {
        if (!active) return;

        if (typeof organization?.name === "string") {
          setOrganizationName(organization.name);
        }

        setCanEditOrganization(account?.role === "owner");
      })
      .catch(() => {
        if (active) notifyError("Não foi possível carregar as configurações.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [notifyError]);

  // O cartão digital é opcional: uma falha ao carregá-lo não deve bloquear as
  // demais configurações da página.
  useEffect(() => {
    let active = true;

    fetch("/api/organization/public-card")
      .then((response) => response.json())
      .then((card) => {
        if (!active || !card || typeof card !== "object") return;
        setCardPublished(Boolean(card.published));
        setCardSlug(typeof card.slug === "string" ? card.slug : "");
        setCardSuggestedSlug(
          typeof card.suggestedSlug === "string" ? card.suggestedSlug : ""
        );
        setCardHeadline(typeof card.headline === "string" ? card.headline : "");
        setCardBio(typeof card.bio === "string" ? card.bio : "");
        setCardInstagram(
          typeof card.instagram === "string" ? card.instagram : ""
        );
      })
      .catch(() => {
        /* Cartão digital indisponível: segue mostrando o restante da página. */
      })
      .finally(() => {
        if (active) setCardLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // O nome do usuário vem do Clerk (fonte da verdade). O estado local (draft) só
  // passa a existir após o usuário editar o campo; até lá o valor exibido é o do
  // Clerk, sem precisar sincronizar estado dentro de um efeito.
  const firstName = firstNameDraft ?? user?.firstName ?? "";
  const lastName = lastNameDraft ?? user?.lastName ?? "";

  async function handleOrganizationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingOrganization || !canEditOrganization) return;

    const name = organizationName.trim();

    if (name.length < 2) {
      notifyError("O nome do negócio deve ter pelo menos 2 caracteres.");
      return;
    }

    setSavingOrganization(true);

    try {
      const response = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível salvar o nome do negócio."
        );
      }

      const savedName = typeof data?.name === "string" ? data.name : name;
      setOrganizationName(savedName);
      window.dispatchEvent(
        new CustomEvent(ORGANIZATION_UPDATED_EVENT, {
          detail: { name: savedName },
        })
      );
      notifySuccess("Nome do negócio atualizado.");
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o nome do negócio."
      );
    } finally {
      setSavingOrganization(false);
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfile || !user) return;

    const first = firstName.trim();
    const last = lastName.trim();

    if (first.length === 0) {
      notifyError("Informe o nome.");
      return;
    }

    setSavingProfile(true);

    try {
      await user.update({ firstName: first, lastName: last });
      setFirstNameDraft(null);
      setLastNameDraft(null);
      notifySuccess("Nome atualizado.");
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o nome."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePublicCardSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingCard || !canEditOrganization) return;

    setSavingCard(true);

    try {
      const response = await fetch("/api/organization/public-card", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          published: cardPublished,
          slug: cardSlug,
          headline: cardHeadline,
          bio: cardBio,
          instagram: cardInstagram,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível salvar o cartão digital."
        );
      }

      setCardPublished(Boolean(data?.published));
      setCardSlug(typeof data?.slug === "string" ? data.slug : cardSlug);
      setCardHeadline(typeof data?.headline === "string" ? data.headline : "");
      setCardBio(typeof data?.bio === "string" ? data.bio : "");
      setCardInstagram(
        typeof data?.instagram === "string" ? data.instagram : ""
      );

      notifySuccess(
        data?.published
          ? "Cartão digital publicado."
          : "Cartão digital despublicado."
      );
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o cartão digital."
      );
    } finally {
      setSavingCard(false);
    }
  }

  async function handleCopyCardLink() {
    const link = `${window.location.origin}/agendar/${cardSlug}`;
    try {
      await navigator.clipboard.writeText(link);
      notifySuccess("Link copiado.");
    } catch {
      notifyError("Não foi possível copiar o link.");
    }
  }

  if (loading) {
    return (
      <main className="app-main-min-h bg-[#fbfaf8] px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm text-[#78867f]">Carregando configurações...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-main-min-h bg-[#fbfaf8] px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a9f8d]">
            Ajustes da conta
          </p>

          <h1 className="mt-3 text-3xl font-semibold text-[#30463c]">
            Configurações
          </h1>

          <p className="mt-3 text-[#78867f]">
            Atualize o nome do seu negócio e os dados da sua conta.
          </p>
        </div>

        <section className="mb-6 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-[0_20px_60px_rgba(64,91,78,0.08)]">
          <h2 className="text-lg font-semibold text-[#30463c]">Meu negócio</h2>

          <form onSubmit={handleOrganizationSubmit} className="mt-5 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#405149]">
                Nome do negócio
              </span>
              <input
                required
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                disabled={!canEditOrganization}
                placeholder="Ex.: Estética Mairon"
                className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d] disabled:cursor-not-allowed disabled:bg-[#f4f7f5] disabled:text-[#8a9891]"
              />
            </label>

            {canEditOrganization ? (
              <button
                type="submit"
                disabled={savingOrganization}
                className="min-h-11 w-full rounded-xl bg-[#527765] px-5 py-3 font-medium text-white transition hover:bg-[#456957] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {savingOrganization ? "Salvando..." : "Salvar"}
              </button>
            ) : (
              <p className="text-sm text-[#8a9891]">
                Apenas o responsável pelo negócio pode alterar este nome.
              </p>
            )}
          </form>
        </section>

        <section className="mb-6 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-[0_20px_60px_rgba(64,91,78,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#30463c]">
                Cartão digital
              </h2>
              <p className="mt-1 text-sm text-[#78867f]">
                Compartilhe um link para suas clientes agendarem sozinhas, sem
                precisar de login.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                cardPublished
                  ? "bg-[#e3f0e8] text-[#527765]"
                  : "bg-[#eef1f0] text-[#6d7d75]"
              }`}
            >
              {cardPublished ? "Publicado" : "Não publicado"}
            </span>
          </div>

          {cardLoading ? (
            <p className="mt-5 text-sm text-[#8a9891]">Carregando...</p>
          ) : (
            <form onSubmit={handlePublicCardSubmit} className="mt-5 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#405149]">
                  Endereço do cartão
                </span>
                <div className="flex items-center gap-2 rounded-xl border border-[#dfe9e3] px-4 py-3 focus-within:border-[#7a9f8d]">
                  <span className="text-sm text-[#8a9891]">/agendar/</span>
                  <input
                    value={cardSlug}
                    onChange={(event) => setCardSlug(event.target.value)}
                    disabled={!canEditOrganization}
                    placeholder={cardSuggestedSlug || "seu-negocio"}
                    className="w-full bg-transparent text-sm outline-none disabled:cursor-not-allowed"
                  />
                </div>
                <span className="mt-1 block text-xs text-[#8a9891]">
                  Use letras minúsculas, números e hífen.
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#405149]">
                  Chamada curta
                </span>
                <input
                  value={cardHeadline}
                  onChange={(event) => setCardHeadline(event.target.value)}
                  disabled={!canEditOrganization}
                  maxLength={160}
                  placeholder="Ex.: Cuidados que realçam sua beleza natural"
                  className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d] disabled:cursor-not-allowed disabled:bg-[#f4f7f5] disabled:text-[#8a9891]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#405149]">
                  Sobre
                </span>
                <textarea
                  value={cardBio}
                  onChange={(event) => setCardBio(event.target.value)}
                  disabled={!canEditOrganization}
                  maxLength={600}
                  rows={3}
                  placeholder="Conte em poucas palavras o que você faz e como atende."
                  className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d] disabled:cursor-not-allowed disabled:bg-[#f4f7f5] disabled:text-[#8a9891]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#405149]">
                  Instagram
                </span>
                <input
                  value={cardInstagram}
                  onChange={(event) => setCardInstagram(event.target.value)}
                  disabled={!canEditOrganization}
                  placeholder="@seuinsta"
                  className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d] disabled:cursor-not-allowed disabled:bg-[#f4f7f5] disabled:text-[#8a9891]"
                />
              </label>
              {canEditOrganization ? (
                <>
                  <label className="flex items-center gap-3 text-sm text-[#405149]">
                    <input
                      type="checkbox"
                      checked={cardPublished}
                      onChange={(event) =>
                        setCardPublished(event.target.checked)
                      }
                      className="h-4 w-4"
                    />
                    Publicar o cartão e permitir agendamento online
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={savingCard}
                      className="min-h-11 rounded-xl bg-[#527765] px-5 py-3 font-medium text-white transition hover:bg-[#456957] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingCard ? "Salvando..." : "Salvar"}
                    </button>

                    {cardPublished && cardSlug ? (
                      <>
                        <a
                          href={`/agendar/${cardSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center rounded-xl border border-[#dfe9e3] px-5 py-3 font-medium text-[#405149] transition hover:bg-[#f4f7f5]"
                        >
                          Ver página
                        </a>
                        <button
                          type="button"
                          onClick={handleCopyCardLink}
                          className="min-h-11 rounded-xl border border-[#dfe9e3] px-5 py-3 font-medium text-[#405149] transition hover:bg-[#f4f7f5]"
                        >
                          Copiar link
                        </button>
                      </>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[#8a9891]">
                  Apenas o responsável pelo negócio pode publicar o cartão.
                </p>
              )}
            </form>
          )}
        </section>

        <section className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-[0_20px_60px_rgba(64,91,78,0.08)]">
          <h2 className="text-lg font-semibold text-[#30463c]">Minha conta</h2>

          <form onSubmit={handleProfileSubmit} className="mt-5 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#405149]">
                  Nome
                </span>
                <input
                  required
                  value={firstName}
                  onChange={(event) => setFirstNameDraft(event.target.value)}
                  placeholder="Seu nome"
                  className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#405149]">
                  Sobrenome
                </span>
                <input
                  value={lastName}
                  onChange={(event) => setLastNameDraft(event.target.value)}
                  placeholder="Seu sobrenome"
                  className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={savingProfile || !userLoaded}
              className="min-h-11 w-full rounded-xl bg-[#527765] px-5 py-3 font-medium text-white transition hover:bg-[#456957] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {savingProfile ? "Salvando..." : "Salvar"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
