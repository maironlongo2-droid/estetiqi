"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildWhatsAppUrl } from "@/lib/clients/whatsapp";
import { requestSuggestedMessage } from "@/lib/ai/message-client";
import { useToast } from "./toast";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
};

type Analytics = {
  revenue?: number;
  previousRevenue?: number;
  revenueChange?: number | null;
  ticketAverage?: number;
  payingClients?: number;
  appointments?: {
    total?: number;
    completed?: number;
    cancelled?: number;
    no_show?: number;
  };
};

type Appointment = {
  id: string;
  client_name: string;
  procedure_name: string | null;
  professional_name: string | null;
  starts_at: string;
  ends_at: string;
  price: number;
  status: string;
};

type Opportunity = {
  id: string;
  title: string;
  description: string;
  priority: string;
  type?: string;
  client_id?: string | null;
  status?: string;
  data?: { suggestedAction?: string };
};

type AIAction = {
  id: string;
  status: string;
  type: string;
};

type ReturningClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  last_appointment_at: string;
  last_procedure_name: string | null;
  inactive_days: number;
  expected_return_days: number;
  priority: "low" | "medium" | "high";
  reason: string;
  suggested_action: string;
  opportunity_id: string | null;
  opportunity_status: string | null;
};

const cardClass = "rounded-2xl border border-[#e4ebe7] bg-white shadow-sm";
const mutedClass = "text-sm text-[#78867f]";

function money(value = 0) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function dateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Não foi possível carregar os dados."
    );
  }
  return data as T;
}

function MetricCard({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={`${cardClass} p-5 sm:p-6`}>
      <p className="text-sm font-medium text-[#78867f]">{label}</p>
      <p
        className={`mt-3 text-2xl font-semibold tracking-tight ${
          accent ? "text-[#30463c]" : "text-[#26352f]"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-[#8a9891]">{detail}</p>
    </article>
  );
}

export default function AppPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClientCount, setActiveClientCount] = useState(0);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [actions, setActions] = useState<AIAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const { notifyError } = useToast();
  const [intelligenceError, setIntelligenceError] = useState("");
  const [returningClients, setReturningClients] = useState<ReturningClient[] | null>(null);
  const [returningError, setReturningError] = useState("");
  const [loadingReturning, setLoadingReturning] = useState(false);
  const [returnMessages, setReturnMessages] = useState<Record<string, string>>({});
  const [messageLoadingId, setMessageLoadingId] = useState<string | null>(null);
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      const now = new Date();
      setCurrentDate(now);
      const today = dateString(now);
      const coreRequests = await Promise.allSettled([
        fetch(
          "/api/clients?status=active&limit=500&sort=created_at&order=desc"
        ).then(readResponse<{
          clients?: Client[];
          total?: number;
        }>),
        fetch("/api/analytics").then(readResponse<Analytics>),
        fetch(`/api/appointments?date=${today}`).then(readResponse<{
          appointments?: Appointment[];
        }>),
      ]);

      if (!active) return;

      let failedCore = false;
      const [clientsResult, analyticsResult, appointmentsResult] = coreRequests;

      if (clientsResult.status === "fulfilled") {
        setClients(clientsResult.value.clients ?? []);
        setActiveClientCount(
          clientsResult.value.total ?? clientsResult.value.clients?.length ?? 0
        );
      } else {
        failedCore = true;
      }

      if (analyticsResult.status === "fulfilled") {
        setAnalytics(analyticsResult.value);
      } else {
        failedCore = true;
      }

      if (appointmentsResult.status === "fulfilled") {
        setAppointments(appointmentsResult.value.appointments ?? []);
      } else {
        failedCore = true;
      }

      if (failedCore) {
        notifyError(
          "Não foi possível carregar alguns dados do painel. Atualize a página para tentar novamente."
        );
      }
      setLoading(false);

      const intelligenceResults = await Promise.allSettled([
        fetch("/api/ai/opportunities").then(readResponse<Opportunity[]>),
        fetch("/api/ai/actions").then(readResponse<AIAction[]>),
      ]);

      if (!active) return;

      const [opportunitiesResult, actionsResult] = intelligenceResults;
      if (opportunitiesResult.status === "fulfilled") {
        setOpportunities(opportunitiesResult.value);
      }
      if (actionsResult.status === "fulfilled") {
        setActions(actionsResult.value);
      }
      if (
        opportunitiesResult.status === "rejected" ||
        actionsResult.status === "rejected"
      ) {
        setIntelligenceError(
          "Não foi possível carregar as recomendações. Verifique sua permissão ou tente novamente."
        );
      }
    }

    void loadDashboard();
    return () => {
      active = false;
    };
  }, [notifyError]);

  async function loadReturningClients() {
    setLoadingReturning(true);
    setReturningError("");

    try {
      const suggestionsResponse = await fetch(
        "/api/ai/opportunities?type=client_return"
      );
      const suggestions = await readResponse<{
        clients?: ReturningClient[];
        opportunities?: Opportunity[];
      }>(suggestionsResponse);
      setReturningClients(suggestions.clients ?? []);

      const response = await fetch("/api/ai/opportunities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "client_return" }),
      });
      if (response.status === 403) {
        setReturningError(
          "Sugestões carregadas. Sua permissão permite visualizá-las, mas não registrar oportunidades."
        );
        mergeReturnOpportunities(suggestions.opportunities ?? []);
        return;
      }

      const data = await readResponse<{
        clients?: ReturningClient[];
        opportunities?: Opportunity[];
        error?: string;
      }>(response);
      setReturningClients(data.clients ?? suggestions.clients ?? []);
      mergeReturnOpportunities(
        data.opportunities ?? suggestions.opportunities ?? []
      );
    } catch {
      setReturningError(
        "Não foi possível identificar clientes para retorno. Verifique sua permissão e tente novamente."
      );
    } finally {
      setLoadingReturning(false);
    }
  }

  async function generateReturnMessage(client: ReturningClient) {
    const opportunityId = client.opportunity_id;
    if (!opportunityId) return;
    setMessageLoadingId(opportunityId);
    setMessageFeedback((current) => ({ ...current, [opportunityId]: "" }));
    try {
      const message = await requestSuggestedMessage(opportunityId);
      setReturnMessages((current) => ({
        ...current,
        [opportunityId]: message,
      }));
    } catch (error) {
      setMessageFeedback((current) => ({
        ...current,
        [opportunityId]:
          error instanceof Error
            ? error.message
            : "Não foi possível gerar a mensagem.",
      }));
    } finally {
      setMessageLoadingId(null);
    }
  }

  async function recordWhatsAppOpened(client: ReturningClient) {
    const opportunityId = client.opportunity_id;
    const message = opportunityId ? returnMessages[opportunityId]?.trim() : "";
    if (!opportunityId || !message) return;

    setMessageActionId(opportunityId);
    try {
      const response = await fetch("/api/ai/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          opportunityId,
          clientId: client.id,
          type: "whatsapp_opened",
          payload: { message },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível registrar a ação.");
      }
      setMessageFeedback((current) => ({
        ...current,
        [opportunityId]: "WhatsApp aberto. O envio da mensagem não é confirmado pelo EstetiQi.",
      }));
    } catch (error) {
      setMessageFeedback((current) => ({
        ...current,
        [opportunityId]:
          error instanceof Error
            ? `WhatsApp aberto, mas a ação não foi registrada: ${error.message}`
            : "WhatsApp aberto, mas não foi possível registrar a ação.",
      }));
    } finally {
      setMessageActionId(null);
    }
  }

  const revenue = analytics?.revenue;
  const revenueChange = analytics?.revenueChange;
  const pendingActions = actions.filter(
    (action) => action.status === "pending_approval"
  );
  const todayAppointments = appointments.filter(
    (appointment) => appointment.status !== "cancelled"
  );

  function mergeReturnOpportunities(returnOpportunities: Opportunity[]) {
    setOpportunities((current) => {
      const returnIds = new Set(returnOpportunities.map(({ id }) => id));
      return [
        ...returnOpportunities,
        ...current.filter(({ id }) => !returnIds.has(id)),
      ].slice(0, 20);
    });
  }

  return (
    <main className="min-h-[calc(100vh-73px)] bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-[#6f927f]">
              {currentDate ? greeting(currentDate) : "Visão geral do negócio"}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#30463c]">
              Início
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#78867f]">
              Veja o que está acontecendo e escolha seu próximo passo.
            </p>
          </div>
          <p className="text-sm font-medium capitalize text-[#78867f]">
            {currentDate
              ? new Intl.DateTimeFormat("pt-BR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(currentDate)
              : ""}
          </p>
        </header>

        <section className={`${cardClass} mt-6 p-5 sm:p-6`}>
          <h2 className="text-lg font-semibold text-[#30463c]">
            O que merece sua atenção?
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-xl bg-[#f7faf8] p-4">
              <p className="text-sm text-[#78867f]">Atendimentos de hoje</p>
              <p className="mt-1 text-2xl font-semibold text-[#30463c]">
                {loading ? "—" : todayAppointments.length}
              </p>
              <Link
                href="/app/agenda"
                className="mt-3 inline-flex min-h-10 items-center font-semibold text-[#527765] hover:underline"
              >
                Ver agenda
              </Link>
            </article>
            <article className="rounded-xl bg-[#f7faf8] p-4">
              <p className="text-sm text-[#78867f]">Clientes com oportunidade de retorno</p>
              <p className="mt-1 text-2xl font-semibold text-[#30463c]">
                {intelligenceError
                  ? "—"
                  : opportunities.filter((item) => item.type === "client_return").length}
              </p>
              <a
                href="#return-opportunities"
                className="mt-3 inline-flex min-h-10 items-center font-semibold text-[#527765] hover:underline"
              >
                Ver oportunidades
              </a>
            </article>
            <article className="rounded-xl bg-[#f7faf8] p-4">
              <p className="text-sm text-[#78867f]">Recomendações para revisar</p>
              <p className="mt-1 text-2xl font-semibold text-[#30463c]">
                {intelligenceError ? "—" : pendingActions.length}
              </p>
              <Link
                href="/app/inteligencia"
                className="mt-3 inline-flex min-h-10 items-center font-semibold text-[#527765] hover:underline"
              >
                Revisar ações
              </Link>
            </article>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Faturamento deste mês"
            value={loading ? "—" : revenue === undefined ? "Indisponível" : money(revenue)}
            detail={
              revenueChange === null || revenueChange === undefined
                ? "Sem comparação com o mês anterior"
                : `${revenueChange >= 0 ? "+" : ""}${revenueChange.toFixed(1)}% em relação ao mês anterior`
            }
            accent
          />
          <MetricCard
            label="Atendimentos de hoje"
            value={loading ? "—" : String(todayAppointments.length)}
            detail={
              loading
                ? "Carregando agenda"
                : appointments.length === 0
                  ? "Nenhum atendimento marcado para hoje"
                  : `${appointments.length} na agenda, incluindo cancelamentos`
            }
          />
          <MetricCard
            label="Clientes ativos"
            value={loading ? "—" : String(activeClientCount)}
            detail="Disponíveis no CRM e para novos agendamentos"
          />
          <MetricCard
            label="Ações para revisar"
            value={intelligenceError ? "—" : String(pendingActions.length)}
            detail={
              intelligenceError
                ? "Recomendações indisponíveis"
                : "Aguardando sua análise"
            }
          />
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
          <article className={`${cardClass} overflow-hidden`}>
            <div className="flex flex-col justify-between gap-4 border-b border-[#e4ebe7] p-5 sm:flex-row sm:items-center sm:p-6">
              <div>
                <h2 className="text-lg font-semibold text-[#30463c]">
                  Agenda de hoje
                </h2>
                <p className={`mt-1 ${mutedClass}`}>
                  Organize sua rotina e acompanhe os próximos atendimentos.
                </p>
              </div>
              <Link
                href="/app/agenda"
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#25382f]"
              >
                Novo agendamento
              </Link>
            </div>

            <div className="divide-y divide-[#eef2ef] px-5 sm:px-6">
              {loading ? (
                <p className="py-6 text-sm text-[#78867f]">Carregando agenda...</p>
              ) : todayAppointments.length === 0 ? (
                <div className="py-8">
                  <p className="font-medium text-[#50655b]">
                    Sua agenda está livre por enquanto.
                  </p>
                  <p className="mt-1 text-sm text-[#78867f]">
                    Aproveite para organizar novos atendimentos.
                  </p>
                </div>
              ) : (
                todayAppointments.slice(0, 5).map((appointment) => (
                  <div
                    key={appointment.id}
                    className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#30463c]">
                        {appointment.client_name}
                      </p>
                      <p className="mt-1 truncate text-sm text-[#78867f]">
                        {appointment.procedure_name || "Atendimento"}
                        {appointment.professional_name
                          ? ` · ${appointment.professional_name}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <span className="text-sm font-medium text-[#50655b]">
                        {new Intl.DateTimeFormat("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(appointment.starts_at))}
                      </span>
                      <span className="rounded-full bg-[#edf3ef] px-3 py-1 text-xs font-medium text-[#50655b]">
                        {appointment.status === "completed"
                          ? "Concluído"
                          : appointment.status === "no_show"
                            ? "Não compareceu"
                            : appointment.status === "confirmed"
                              ? "Confirmado"
                              : "Agendado"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!loading && todayAppointments.length > 5 && (
              <div className="border-t border-[#eef2ef] px-5 py-3 sm:px-6">
                <Link
                  href="/app/agenda"
                  className="text-sm font-semibold text-[#527765] hover:underline"
                >
                  Ver todos os {todayAppointments.length} atendimentos
                </Link>
              </div>
            )}
          </article>

          <article id="return-opportunities" className={`${cardClass} p-5 sm:p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#6f927f]">
              Oportunidade de relacionamento
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#30463c]">
              Clientes que podem estar prontos para voltar
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#78867f]">
              Regras de retorno consideram o histórico, o intervalo do procedimento,
              cancelamentos e agendamentos futuros. Nenhuma mensagem é enviada
              automaticamente.
            </p>
            <button
              type="button"
              onClick={loadReturningClients}
              disabled={loadingReturning}
              className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[#dce5e0] bg-[#f7faf8] px-4 py-2 text-sm font-semibold text-[#30463c] transition hover:bg-[#edf3ef] disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              {loadingReturning
                ? "Analisando..."
                : returningClients === null
                  ? "Gerar oportunidades de retorno"
                  : "Atualizar oportunidades"}
            </button>

            {returningError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {returningError}
              </p>
            )}
            {returningClients !== null && (
              <div className="mt-5 border-t border-[#e4ebe7] pt-4">
                <p className="text-2xl font-semibold text-[#30463c]">
                  {returningClients.length}
                  <span className="ml-2 text-sm font-normal text-[#78867f]">
                    clientes encontrados
                  </span>
                </p>
                {returningClients.length === 0 ? (
                  <p className="mt-3 text-sm text-[#78867f]">
                    Nenhuma oportunidade de retorno foi identificada. É necessário
                    haver histórico suficiente e um período de retorno configurado
                    ou recorrente, sem agendamento futuro.
                  </p>
                ) : (
                  <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
                    {returningClients.slice(0, 5).map((client) => {
                      const whatsapp = buildWhatsAppUrl({
                        name: client.name,
                        phone: client.phone,
                        lastProcedureName: client.last_procedure_name,
                      });
                      return (
                        <div
                          key={client.id}
                          className="flex flex-col gap-3 rounded-xl bg-[#f7faf8] p-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0 sm:flex-1">
                            <Link
                              href={`/app/clientes/${client.id}`}
                              className="truncate text-sm font-semibold text-[#30463c] hover:underline"
                            >
                              {client.name}
                            </Link>
                            <p className="mt-1 text-xs text-[#78867f]">
                              {client.reason}
                            </p>
                            <p className="mt-1 text-xs font-medium text-[#50655b]">
                              Próxima ação: {client.suggested_action}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                client.priority === "high"
                                  ? "bg-red-50 text-red-700"
                                  : client.priority === "medium"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-[#edf3ef] text-[#50655b]"
                              }`}
                            >
                              {client.priority === "high"
                                ? "Alta"
                                : client.priority === "medium"
                                  ? "Média"
                                  : "Baixa"}
                            </span>
                            {client.opportunity_id ? (
                              <>
                                {!returnMessages[client.opportunity_id] ? (
                                  <button
                                    type="button"
                                    onClick={() => void generateReturnMessage(client)}
                                    disabled={messageLoadingId === client.opportunity_id}
                                    className="min-h-10 rounded-lg bg-[#30463c] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                  >
                                    {messageLoadingId === client.opportunity_id
                                      ? "Gerando mensagem..."
                                      : "Gerar mensagem"}
                                  </button>
                                ) : (
                                  <div className="w-full space-y-2 sm:w-72">
                                    <label className="block text-xs font-medium text-[#50655b]">
                                      Revise ou edite a mensagem
                                      <textarea
                                        value={returnMessages[client.opportunity_id]}
                                        onChange={(event) =>
                                          setReturnMessages((current) => ({
                                            ...current,
                                            [client.opportunity_id!]: event.target.value,
                                          }))
                                        }
                                        rows={4}
                                        maxLength={500}
                                        className="mt-1 w-full rounded-lg border border-[#dce5e0] bg-white p-2 text-sm font-normal"
                                      />
                                    </label>
                                    {whatsapp && returnMessages[client.opportunity_id].trim() && (
                                      <a
                                        href={buildWhatsAppUrl({
                                          name: client.name,
                                          phone: client.phone,
                                          message: returnMessages[client.opportunity_id],
                                        }) ?? "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => void recordWhatsAppOpened(client)}
                                        className="inline-flex min-h-10 items-center rounded-lg bg-[#527765] px-3 py-2 text-xs font-semibold text-white hover:bg-[#456957]"
                                      >
                                        {messageActionId === client.opportunity_id
                                          ? "Abrindo WhatsApp..."
                                          : "Abrir WhatsApp"}
                                      </a>
                                    )}
                                  </div>
                                )}
                                {messageFeedback[client.opportunity_id] && (
                                  <p role="status" className="max-w-72 text-xs text-[#50655b]">
                                    {messageFeedback[client.opportunity_id]}
                                  </p>
                                )}
                              </>
                            ) : whatsapp ? (
                              <a
                                href={whatsapp}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-10 items-center rounded-lg bg-[#527765] px-3 py-2 text-xs font-semibold text-white hover:bg-[#456957]"
                              >
                                Abrir WhatsApp
                              </a>
                            ) : (
                              <span className="text-xs text-[#8a9891]">
                                Sem telefone
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {returningClients.length > 5 && (
                  <Link
                    href="/app/automacoes"
                    className="mt-3 inline-block text-sm font-semibold text-[#527765] hover:underline"
                  >
                    Ver os {returningClients.length} clientes em Automações
                  </Link>
                )}
              </div>
            )}
          </article>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <article className={`${cardClass} p-5 sm:p-6`}>
            <div>
              <h2 className="text-lg font-semibold text-[#30463c]">
                Próximos passos
              </h2>
              <p className={`mt-1 ${mutedClass}`}>
                Ações rápidas para manter a operação em movimento.
              </p>
            </div>
            <div className="mt-5 grid gap-3">
              <Link
                href="/app/clientes"
                className="flex min-h-12 items-center justify-between rounded-xl bg-[#30463c] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#25382f]"
              >
                Novo cliente <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/app/agenda"
                className="flex min-h-12 items-center justify-between rounded-xl border border-[#dce5e0] px-4 py-3 text-sm font-semibold text-[#30463c] transition hover:bg-[#f7faf8]"
              >
                Registrar pagamento <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/app/financeiro"
                className="flex min-h-12 items-center justify-between rounded-xl border border-[#dce5e0] px-4 py-3 text-sm font-semibold text-[#30463c] transition hover:bg-[#f7faf8]"
              >
                Acompanhar financeiro <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#8a9891]">
              O registro de pagamento é feito a partir do atendimento na Agenda.
            </p>
          </article>

          <article className={`${cardClass} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-[#e4ebe7] p-5 sm:p-6">
              <div>
                <h2 className="text-lg font-semibold text-[#30463c]">
                  Recomendações
                </h2>
                <p className={`mt-1 ${mutedClass}`}>
                  Oportunidades já identificadas para o seu negócio.
                </p>
              </div>
              <Link
                href="/app/inteligencia"
                className="shrink-0 text-sm font-semibold text-[#527765] hover:underline"
              >
                Ver todas
              </Link>
            </div>
            {intelligenceError ? (
              <p role="alert" className="p-5 text-sm text-[#78867f] sm:p-6">
                {intelligenceError}
              </p>
            ) : opportunities.length === 0 ? (
              <div className="p-5 sm:p-6">
                <p className="font-medium text-[#50655b]">
                  Nenhuma oportunidade aberta no momento.
                </p>
                <p className="mt-1 text-sm text-[#78867f]">
                  Acesse o Assistente IA para analisar os dados disponíveis.
                </p>
                <Link
                  href="/app/inteligencia"
                  className="mt-4 inline-flex rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold text-[#30463c] hover:bg-[#f7faf8]"
                >
                  Ir para o Assistente IA
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#eef2ef]">
                {opportunities.slice(0, 3).map((opportunity) => (
                  <div key={opportunity.id} className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-[#30463c]">
                        {opportunity.title}
                      </h3>
                      <span className="shrink-0 rounded-full bg-[#edf3ef] px-2.5 py-1 text-xs font-medium text-[#50655b]">
                        {opportunity.priority === "high"
                          ? "Alta"
                          : opportunity.priority === "medium"
                            ? "Média"
                            : "Normal"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#78867f]">
                      {opportunity.description}
                    </p>
                    {opportunity.data?.suggestedAction && (
                      <p className="mt-3 text-sm font-medium text-[#50655b]">
                        Próxima ação: {opportunity.data.suggestedAction}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className={`${cardClass} mt-6 overflow-hidden`}>
          <div className="flex items-center justify-between gap-4 border-b border-[#e4ebe7] p-5 sm:p-6">
            <div>
              <h2 className="text-lg font-semibold text-[#30463c]">
                Clientes ativos recentes
              </h2>
              <p className={`mt-1 ${mutedClass}`}>
                Acesse rapidamente os contatos do seu CRM.
              </p>
            </div>
            <Link
              href="/app/clientes"
              className="shrink-0 text-sm font-semibold text-[#527765] hover:underline"
            >
              Ver CRM
            </Link>
          </div>
          <div className="divide-y divide-[#eef2ef] px-5 sm:px-6">
            {loading ? (
              <p className="py-5 text-sm text-[#78867f]">Carregando clientes...</p>
            ) : clients.length === 0 ? (
              <div className="py-6">
                <p className="font-medium text-[#50655b]">
                  Nenhum cliente ativo cadastrado.
                </p>
                <Link
                  href="/app/clientes"
                  className="mt-2 inline-block text-sm font-semibold text-[#527765] hover:underline"
                >
                  Cadastrar primeiro cliente
                </Link>
              </div>
            ) : (
              clients.slice(0, 4).map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#30463c]">
                      {client.name}
                    </p>
                    <p className="mt-1 truncate text-sm text-[#78867f]">
                      {client.phone || client.email || "Sem contato cadastrado"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#edf7ef] px-3 py-1 text-xs font-medium text-[#477152]">
                    Ativo
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
