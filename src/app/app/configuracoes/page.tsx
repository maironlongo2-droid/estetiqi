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
