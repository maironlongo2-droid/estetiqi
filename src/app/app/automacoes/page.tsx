"use client";

import { useCallback, useEffect, useState } from "react";
import { buildWhatsAppUrl } from "@/lib/clients/whatsapp";
import { requestSuggestedMessage } from "@/lib/ai/message-client";
import { useToast } from "../toast";

type InactiveClient = {
  id: string;
  name: string;
  last_appointment_at: string;
  inactive_days: number;
};

type ReturnCandidate = {
  id: string;
  name: string;
  phone: string | null;
  last_appointment_at: string;
  last_procedure_name: string | null;
  inactive_days: number;
  expected_return_days: number;
  priority: "low" | "medium" | "high";
  reason: string;
  suggested_action: string;
  opportunity_id: string | null;
};

const priorityLabel = { high: "Prioridade alta", medium: "Prioridade média", low: "Prioridade baixa" };
const TOP_OPPORTUNITIES = 5;

function sinceLabel(days: number) {
  if (days <= 0) return "hoje";
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

function updatedLabel(date: Date | null) {
  if (!date) return "—";
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Hoje, ${time}`;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5">
      <div className="text-3xl font-semibold text-[#30463c]">{value}</div>
      <div className="mt-1 text-sm text-[#78867f]">{label}</div>
    </div>
  );
}

export default function AutomacoesPage() {
  const { notifyError } = useToast();
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [candidates, setCandidates] = useState<ReturnCandidate[]>([]);
  const [inactiveClients, setInactiveClients] = useState<InactiveClient[]>([]);
  const [inactiveDays, setInactiveDays] = useState("60");
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (days: string, register: boolean) => {
      try {
        const [candidatesResponse, inactiveResponse] = await Promise.all([
          fetch("/api/ai/opportunities?type=client_return"),
          fetch(`/api/ai/inactive-clients?days=${days}`),
        ]);
        if (!candidatesResponse.ok) {
          throw new Error("Não foi possível carregar as oportunidades de retorno.");
        }
        let nextCandidates: ReturnCandidate[] =
          (await candidatesResponse.json()).clients ?? [];

        if (register) {
          // Registra as oportunidades para que a mensagem possa ser preparada.
          const registered = await fetch("/api/ai/opportunities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "client_return" }),
          });
          if (registered.ok) {
            nextCandidates = (await registered.json()).clients ?? nextCandidates;
          } else if (registered.status !== 403) {
            throw new Error("Não foi possível atualizar as oportunidades.");
          }
        }
        setCandidates(nextCandidates);

        if (inactiveResponse.ok) {
          setInactiveClients((await inactiveResponse.json()).clients ?? []);
        } else {
          notifyError("Não foi possível carregar os clientes sem retorno.");
        }
        setUpdatedAt(new Date());
      } catch (error) {
        notifyError(
          error instanceof Error ? error.message : "Não foi possível atualizar agora."
        );
      } finally {
        setLoading(false);
      }
    },
    [notifyError]
  );

  useEffect(() => {
    // Carga inicial dos dados da página.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("60", false);
  }, [load]);

  function refresh(days: string, register: boolean) {
    setLoading(true);
    void load(days, register);
  }

  async function ensureOpportunityId(candidate: ReturnCandidate) {
    if (candidate.opportunity_id) return candidate.opportunity_id;
    const response = await fetch("/api/ai/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "client_return" }),
    });
    if (!response.ok) throw new Error("Não foi possível registrar a oportunidade.");
    const registered: ReturnCandidate[] = (await response.json()).clients ?? [];
    setCandidates(registered);
    const match = registered.find((item) => item.id === candidate.id);
    if (!match?.opportunity_id) throw new Error("Oportunidade não encontrada. Atualize a lista.");
    return match.opportunity_id;
  }

  async function prepareMessage(candidate: ReturnCandidate) {
    setBusyId(candidate.id);
    try {
      const opportunityId = await ensureOpportunityId(candidate);
      const message = await requestSuggestedMessage(opportunityId);
      setMessages((current) => ({ ...current, [candidate.id]: message }));
    } catch (error) {
      notifyError(
        error instanceof Error ? error.message : "Não foi possível preparar a mensagem."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function recordWhatsApp(candidate: ReturnCandidate) {
    const message = messages[candidate.id]?.trim();
    if (!candidate.opportunity_id || !message) return;
    try {
      const response = await fetch("/api/ai/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          opportunityId: candidate.opportunity_id,
          clientId: candidate.id,
          type: "whatsapp_opened",
          payload: { message },
        }),
      });
      if (!response.ok) throw new Error();
    } catch {
      notifyError("O WhatsApp foi aberto, mas a ação não foi registrada.");
    }
  }

  const top = candidates.slice(0, TOP_OPPORTUNITIES);

  return (
    <main className="min-h-[calc(100vh-73px)] bg-[#fbfaf8] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#30463c]">
              Automações
            </h1>
            <p className="mt-2 text-sm text-[#78867f]">
              Encontre oportunidades de retorno e transforme-as em ações.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh(inactiveDays, true)}
            disabled={loading}
            className="min-h-10 rounded-xl bg-[#527765] px-5 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </header>

        <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Clientes para reativar"
            value={loading && !updatedAt ? "…" : inactiveClients.length}
          />
          <SummaryCard
            label="Oportunidades encontradas"
            value={loading && !updatedAt ? "…" : candidates.length}
          />
          <SummaryCard label="Última atualização" value={updatedLabel(updatedAt)} />
        </section>

        <section className="mt-8" aria-labelledby="top-opportunities">
          <h2 id="top-opportunities" className="text-xl font-semibold text-[#30463c]">
            Principais oportunidades
          </h2>

          {!loading && top.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[#d5e0d9] bg-white p-6 text-sm text-[#78867f]">
              Nenhuma oportunidade de retorno no momento. Elas aparecem quando há
              clientes com atendimentos concluídos perto do prazo de retorno.
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {top.map((candidate) => {
                const open = openId === candidate.id;
                const message = messages[candidate.id] ?? "";
                const whatsapp = buildWhatsAppUrl({
                  name: candidate.name,
                  phone: candidate.phone,
                  lastProcedureName: candidate.last_procedure_name,
                  message,
                });
                return (
                  <li
                    key={candidate.id}
                    className="rounded-2xl border border-[#dfe9e3] bg-white p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-semibold text-[#30463c]">{candidate.name}</div>
                        <div className="mt-1 text-sm text-[#78867f]">
                          Retorno recomendado · Último atendimento:{" "}
                          {sinceLabel(candidate.inactive_days)}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : candidate.id)}
                        className="min-h-10 rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold text-[#30463c] hover:bg-[#f4f7f5]"
                      >
                        {open ? "Fechar" : "Ver oportunidade"}
                      </button>
                    </div>

                    {open && (
                      <div className="mt-4 space-y-4 border-t border-[#edf1ee] pt-4 text-sm">
                        <dl className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <dt className="font-medium text-[#52635b]">Motivo</dt>
                            <dd className="mt-1 text-[#78867f]">{candidate.reason}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[#52635b]">Ação sugerida</dt>
                            <dd className="mt-1 text-[#78867f]">{candidate.suggested_action}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[#52635b]">Último procedimento</dt>
                            <dd className="mt-1 text-[#78867f]">
                              {candidate.last_procedure_name ?? "Não informado"} em{" "}
                              {new Date(candidate.last_appointment_at).toLocaleDateString("pt-BR")}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[#52635b]">Status</dt>
                            <dd className="mt-1 text-[#78867f]">
                              {priorityLabel[candidate.priority]} · retorno esperado em{" "}
                              {candidate.expected_return_days} dias
                            </dd>
                          </div>
                        </dl>

                        {message && (
                          <div>
                            <div className="font-medium text-[#52635b]">Mensagem sugerida</div>
                            <textarea
                              aria-label={`Mensagem para ${candidate.name}`}
                              value={message}
                              onChange={(event) =>
                                setMessages((current) => ({
                                  ...current,
                                  [candidate.id]: event.target.value,
                                }))
                              }
                              rows={4}
                              className="mt-1 w-full rounded-xl border border-[#dce5e0] p-3"
                            />
                          </div>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => void prepareMessage(candidate)}
                            disabled={busyId === candidate.id}
                            className="min-h-10 rounded-xl bg-[#527765] px-4 py-2 font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                          >
                            {busyId === candidate.id
                              ? "Preparando..."
                              : message
                                ? "Gerar outra mensagem"
                                : "Preparar mensagem"}
                          </button>
                          {message && whatsapp ? (
                            <a
                              href={whatsapp}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => void recordWhatsApp(candidate)}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#527765] px-4 py-2 font-semibold text-[#527765] hover:bg-[#f4f7f5]"
                            >
                              Abrir WhatsApp
                            </a>
                          ) : null}
                        </div>
                        {message && !whatsapp && (
                          <p className="text-[#78867f]">
                            Esta cliente não tem telefone válido cadastrado.
                          </p>
                        )}
                        <p className="text-xs text-[#78867f]">
                          Nenhuma mensagem é enviada automaticamente: você revisa e envia pelo WhatsApp.
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {candidates.length > TOP_OPPORTUNITIES && (
            <p className="mt-3 text-sm text-[#78867f]">
              Mostrando {TOP_OPPORTUNITIES} de {candidates.length} oportunidades.
            </p>
          )}
        </section>

        <details className="mt-8 rounded-2xl border border-[#dfe9e3] bg-white p-5">
          <summary className="cursor-pointer text-lg font-semibold text-[#30463c]">
            Clientes sem voltar
          </summary>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="text-sm text-[#52635b]">
              Considerar sem retorno após
              <select
                value={inactiveDays}
                onChange={(event) => setInactiveDays(event.target.value)}
                className="mt-1 block rounded-xl border border-[#dfe9e3] px-3 py-2 text-sm"
              >
                {["30", "45", "60", "90", "120"].map((days) => (
                  <option key={days} value={days}>
                    {days} dias
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => refresh(inactiveDays, false)}
              disabled={loading}
              className="min-h-10 rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold text-[#30463c] disabled:opacity-60"
            >
              Aplicar prazo
            </button>
          </div>
          {inactiveClients.length === 0 ? (
            <p className="mt-4 text-sm text-[#78867f]">
              Nenhum cliente encontrado nesse período.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {inactiveClients.map((client) => (
                <li
                  key={client.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#e5ebe7] px-4 py-3 text-sm"
                >
                  <span className="font-medium text-[#30463c]">{client.name}</span>
                  <span className="text-[#78867f]">
                    {client.inactive_days} dias sem retornar
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
    </main>
  );
}
