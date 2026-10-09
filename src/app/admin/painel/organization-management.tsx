"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrganizationOverview } from "@/lib/admin/organizations";

// Desempenho das organizações (ranking) + gestão de organizações (bloquear e
// desbloquear com registro de motivo). O componente consome apenas as APIs
// /api/admin/organizations*, que revalidam a autorização no servidor.

const PERIOD_OPTIONS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
] as const;

const numberFormatter = new Intl.NumberFormat("pt-BR");
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : dateFormatter.format(parsed);
}

type RankingEntry = {
  id: string;
  name: string;
  primary: string;
  secondary?: string;
};

function topBy(
  organizations: OrganizationOverview[],
  score: (organization: OrganizationOverview) => number,
  format: (organization: OrganizationOverview) => string,
  secondary: (organization: OrganizationOverview) => string | undefined,
  limit = 5
): RankingEntry[] {
  return [...organizations]
    .filter((organization) => score(organization) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
    .map((organization) => ({
      id: organization.id,
      name: organization.name,
      primary: format(organization),
      secondary: secondary(organization),
    }));
}

function RankingList({ title, entries }: { title: string; entries: RankingEntry[] }) {
  return (
    <div className="rounded-2xl border border-[#e4ebe7] p-4">
      <h3 className="text-sm font-semibold text-[#30463c]">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-[#8a9891]">
          Sem registros no período selecionado.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {entries.map((entry, index) => (
            <li key={entry.id} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#edf3ef] text-xs font-semibold text-[#30463c]">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-[#405149]">
                    {entry.name}
                  </span>
                  {entry.secondary ? (
                    <span className="block text-[11px] text-[#8a9891]">
                      {entry.secondary}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-[#30463c]">
                {entry.primary}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function OrganizationManagement() {
  const [period, setPeriod] = useState<number>(30);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "blocked"
  >("all");
  const [organizations, setOrganizations] = useState<OrganizationOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [actionTarget, setActionTarget] =
    useState<OrganizationOverview | null>(null);
  const [actionType, setActionType] = useState<"block" | "unblock" | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ days: String(period) });
      if (query) params.set("q", query);
      const response = await fetch(`/api/admin/organizations?${params}`);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Não foi possível carregar as organizações."
        );
      }

      setOrganizations(
        Array.isArray(payload?.organizations) ? payload.organizations : []
      );
    } catch (loadError) {
      setOrganizations([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar as organizações."
      );
    } finally {
      setLoading(false);
    }
  }, [period, query]);

  // Espera o usuário parar de digitar antes de consultar (evita uma consulta
  // por tecla, já que cada consulta é uma requisição ao banco).
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const rankings = useMemo(
    () => ({
      financial: topBy(
        organizations,
        (organization) => organization.confirmedVolumeInPeriod,
        (organization) => formatCurrency(organization.confirmedVolumeInPeriod),
        (organization) =>
          `${formatNumber(organization.clients)} clientes no CRM`
      ),
      clients: topBy(
        organizations,
        (organization) => organization.clients,
        (organization) => formatNumber(organization.clients),
        (organization) =>
          `${formatCurrency(organization.confirmedVolumeTotal)} confirmados`
      ),
      appointments: topBy(
        organizations,
        (organization) => organization.appointmentsInPeriod,
        (organization) => formatNumber(organization.appointmentsInPeriod),
        (organization) =>
          `${formatNumber(organization.appointmentsTotal)} no total`
      ),
      usage: topBy(
        organizations,
        (organization) => organization.activeDaysInPeriod,
        (organization) => `${formatNumber(organization.activeDaysInPeriod)} dias`,
        (organization) => `Última atividade: ${formatDate(organization.lastActivityAt)}`
      ),
    }),
    [organizations]
  );

  const visibleOrganizations = useMemo(
    () =>
      statusFilter === "all"
        ? organizations
        : organizations.filter((organization) => organization.status === statusFilter),
    [organizations, statusFilter]
  );

  function openAction(organization: OrganizationOverview, type: "block" | "unblock") {
    setActionTarget(organization);
    setActionType(type);
    setReason("");
    setActionError("");
  }

  function closeAction() {
    if (saving) return;
    setActionTarget(null);
    setActionType(null);
    setReason("");
    setActionError("");
  }

  async function submitAction() {
    if (!actionTarget || !actionType) return;

    setSaving(true);
    setActionError("");

    try {
      const response = await fetch(
        `/api/admin/organizations/${actionTarget.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: actionType, reason: reason.trim() }),
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Não foi possível concluir a ação."
        );
      }

      setActionTarget(null);
      setActionType(null);
      setReason("");
      await load();
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível concluir a ação."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#30463c]">
              Desempenho das organizações
            </h2>
            <p className="mt-1 text-xs text-[#78867f]">
              Ranking por movimentação financeira registrada (pagamentos
              confirmados), base de clientes no CRM, agendamentos e frequência de
              uso no período selecionado.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_OPTIONS.map((option) => {
              const active = option.days === period;
              return (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setPeriod(option.days)}
                  aria-pressed={active}
                  className={`min-h-9 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-[#30463c] text-white"
                      : "border border-[#dfe9e3] text-[#50655b] hover:bg-[#f4f7f5]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </header>

        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        ) : loading ? (
          <p className="text-sm text-[#78867f]">Carregando organizações…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <RankingList
              title="Maior movimentação (pagamentos confirmados)"
              entries={rankings.financial}
            />
            <RankingList
              title="Maior base de clientes no CRM"
              entries={rankings.clients}
            />
            <RankingList
              title="Mais agendamentos no período"
              entries={rankings.appointments}
            />
            <RankingList
              title="Maior frequência de uso"
              entries={rankings.usage}
            />
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-[#30463c]">
            Gestão de organizações
          </h2>
          <p className="mt-1 text-xs text-[#78867f]">
            Listagem pesquisável com situação cadastral, uso e assinatura. O
            bloqueio é aplicado no servidor e seus dados permanecem preservados.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar por nome ou endereço"
            className="min-h-11 flex-1 rounded-xl border border-[#dfe9e3] px-4 py-2 text-sm outline-none focus:border-[#7a9f8d]"
          />
          <select
            aria-label="Filtrar por situação"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | "active" | "blocked")
            }
            className="min-h-11 rounded-xl border border-[#dfe9e3] px-3 py-2 text-sm"
          >
            <option value="all">Todas</option>
            <option value="active">Ativas</option>
            <option value="blocked">Bloqueadas</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-[#78867f]">Carregando…</p>
        ) : visibleOrganizations.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#cfdcd5] p-6 text-sm text-[#78867f]">
            Nenhuma organização encontrada.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#e4ebe7]">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#f4f7f5] text-xs uppercase tracking-wide text-[#8a9891]">
                <tr>
                  <th className="px-4 py-2 font-medium">Organização</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                  <th className="px-4 py-2 font-medium">Assinatura</th>
                  <th className="px-4 py-2 text-right font-medium">CRM</th>
                  <th className="px-4 py-2 text-right font-medium">Agend. no período</th>
                  <th className="px-4 py-2 text-right font-medium">Confirmados no período</th>
                  <th className="px-4 py-2 font-medium">Última atividade</th>
                  <th className="px-4 py-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e4ebe7]">
                {visibleOrganizations.map((organization) => {
                  const blocked = organization.status === "blocked";
                  return (
                    <tr key={organization.id}>
                      <td className="px-4 py-2 text-[#405149]">
                        <span className="block font-medium text-[#30463c]">
                          {organization.name}
                        </span>
                        <span className="block text-xs text-[#8a9891]">
                          /{organization.slug}
                        </span>
                        {blocked && organization.blockedReason ? (
                          <span className="mt-1 block text-xs text-[#9c4b3d]">
                            Motivo: {organization.blockedReason}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            blocked
                              ? "bg-[#fff1ee] text-[#9c4b3d]"
                              : "bg-[#edf7ef] text-[#477152]"
                          }`}
                        >
                          {blocked ? "Bloqueada" : "Ativa"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[#405149]">
                        {organization.subscriptionCanceledAt
                          ? "Cancelada"
                          : organization.subscribedAt
                            ? `Desde ${formatDate(organization.subscribedAt)}`
                            : "Em teste"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#405149]">
                        {formatNumber(organization.clients)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#405149]">
                        {formatNumber(organization.appointmentsInPeriod)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#405149]">
                        {formatCurrency(organization.confirmedVolumeInPeriod)}
                      </td>
                      <td className="px-4 py-2 text-[#405149]">
                        {formatDate(organization.lastActivityAt)}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            openAction(organization, blocked ? "unblock" : "block")
                          }
                          className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            blocked
                              ? "border border-[#dfe9e3] text-[#405149] hover:bg-[#f4f7f5]"
                              : "border border-[#e7cfca] text-[#9c4b3d] hover:bg-[#fff1ee]"
                          }`}
                        >
                          {blocked ? "Desbloquear" : "Bloquear"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {actionTarget && actionType ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={
            actionType === "block"
              ? "Confirmar bloqueio"
              : "Confirmar desbloqueio"
          }
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[#30463c]">
              {actionType === "block"
                ? "Bloquear organização"
                : "Desbloquear organização"}
            </h3>
            <p className="mt-2 text-sm text-[#66756d]">
              {actionType === "block"
                ? `A organização "${actionTarget.name}" perderá o acesso ao sistema. Os dados serão preservados.`
                : `A organização "${actionTarget.name}" voltará a ter acesso ao sistema.`}
            </p>

            {actionType === "block" ? (
              <label className="mt-4 block text-sm font-medium text-[#50655b]">
                Motivo do bloqueio (recomendado)
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] p-3 text-sm outline-none focus:border-[#7a9f8d]"
                  placeholder="Ex.: inadimplência, solicitação do cliente, uso indevido"
                />
              </label>
            ) : null}

            {actionError ? (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {actionError}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAction}
                disabled={saving}
                className="min-h-10 rounded-xl border border-[#dfe9e3] px-4 py-2 text-sm font-medium text-[#50655b] transition hover:bg-[#f4f7f5] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitAction()}
                disabled={saving}
                className={`min-h-10 rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
                  actionType === "block"
                    ? "bg-[#9c4b3d] hover:bg-[#853f33]"
                    : "bg-[#527765] hover:bg-[#456957]"
                }`}
              >
                {saving
                  ? "Salvando…"
                  : actionType === "block"
                    ? "Bloquear"
                    : "Desbloquear"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
