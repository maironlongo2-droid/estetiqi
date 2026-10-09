"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "../toast";
import { useProcedureLabels } from "../procedure-labels";
import { buildWhatsAppUrl } from "@/lib/clients/whatsapp";
import { requestSuggestedMessage } from "@/lib/ai/message-client";

type Opportunity = {
  id: string;
  title: string;
  description: string;
  type: string;
  client_id: string | null;
  client_name: string | null;
  priority: "low" | "medium" | "high";
  data: {
    suggestedAction?: string | null;
    target?: { name?: string | null };
    returnIntervalDays?: number | null;
  };
};

type ClientHistory = {
  client: {
    name: string;
    phone: string | null;
  };
  appointments: Array<{
    id: string;
    starts_at: string;
    status: string;
    procedure_name: string | null;
    professional_name: string | null;
  }>;
  totals: {
    completed_count: number;
    last_appointment_at: string | null;
    last_procedure: string | null;
    return_interval_days: number | null;
  };
};

type AIAction = {
  id: string;
  opportunity_id: string | null;
  status: string;
  payload?: {
    opportunity?: {
      title?: string;
      description?: string;
    };
  };
  created_at?: string;
};

type Metrics = {
  revenue: number;
  previousRevenue: number;
  revenueChange: number | null;
  payments: number;
  payingClients: number;
  ticketAverage: number;
  professionals: Array<{
    professionalName: string;
    appointments: number;
    revenue: number;
    ticketAverage: number;
  }>;
};

function wasRejectedForSameReason(
  opportunity: Opportunity,
  action: AIAction | undefined
) {
  if (action?.status !== "cancelled") return false;
  if (opportunity.type === "client_return") return true;
  const rejectedDescription = action.payload?.opportunity?.description;
  return !rejectedDescription || rejectedDescription === opportunity.description;
}

export default function InteligenciaPage() {
  const { notifyError } = useToast();
  const labels = useProcedureLabels();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [creatingAction, setCreatingAction] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, AIAction>>({});
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [suggestedMessages, setSuggestedMessages] = useState<Record<string, string>>({});
  const [messageLoadingId, setMessageLoadingId] = useState<string | null>(null);
  const [messageError, setMessageError] = useState("");
  const [messageFallback, setMessageFallback] = useState<Record<string, boolean>>({});
  const [whatsappFeedback, setWhatsappFeedback] = useState("");
  const [clientHistory, setClientHistory] = useState<ClientHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const opportunityDialogRef = useRef<HTMLDialogElement>(null);
  const historyRequestIdRef = useRef(0);
  const [actionFeedback, setActionFeedback] = useState("");
  const [pageError, setPageError] = useState("");

  async function load() {
    try {
      const [metricsResponse, opportunitiesResponse, actionsResponse] = await Promise.all([
        fetch("/api/analytics"),
        fetch("/api/ai/opportunities"),
        fetch("/api/ai/actions"),
      ]);
      const opportunityRows = opportunitiesResponse.ok
        ? (await opportunitiesResponse.json() as Opportunity[])
        : [];
      let latestActions: Record<string, AIAction> = {};

      if (metricsResponse.ok) {
        setMetrics(await metricsResponse.json());
      }

      if (actionsResponse.ok) {
        const actionRows = await actionsResponse.json() as AIAction[];
        latestActions = {};
        for (const action of actionRows) {
          if (
            action.opportunity_id &&
            action.status !== "whatsapp_opened" &&
            !latestActions[action.opportunity_id]
          ) {
            latestActions[action.opportunity_id] = action;
          }
        }
      }
      setActions(latestActions);
      setOpportunities(
        opportunityRows.filter(
          (opportunity) =>
            !wasRejectedForSameReason(
              opportunity,
              latestActions[opportunity.id]
            )
        )
      );

      if (
        !metricsResponse.ok ||
        !opportunitiesResponse.ok ||
        !actionsResponse.ok
      ) {
        notifyError("Algumas informações não puderam ser carregadas. Verifique sua permissão e tente novamente.");
      }
    } catch {
      notifyError("Não foi possível carregar o Assistente IA agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function generateOpportunities() {
    setGenerating(true);
    setPageError("");

    try {
      const response = await fetch("/api/ai/opportunities", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível analisar oportunidades.");
      }
      await load();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Não foi possível analisar oportunidades."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function createAction(opportunity: Opportunity) {
    setCreatingAction(opportunity.id);
    setActionFeedback("");

    try {
      const response = await fetch("/api/ai/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          type: "recommended_action",
          payload: {
            suggestedAction: opportunity.data?.suggestedAction ?? null,
          },
        }),
      });
      const action = await response.json();
      if (!response.ok) {
        throw new Error(action.error || "Não foi possível criar a ação.");
      }

      setActions((current) => ({
        ...current,
        [opportunity.id]: {
          id: action.id,
          opportunity_id: opportunity.id,
          status: action.status,
        },
      }));
    } catch (error) {
      setActionFeedback(
        error instanceof Error ? error.message : "Não foi possível criar a ação."
      );
    } finally {
      setCreatingAction(null);
    }
  }

  async function processAction(
    opportunityId: string,
    actionId: string,
    status: "approved" | "cancelled" | "execute"
  ) {
    setProcessingAction(actionId);
    setActionFeedback("");

    try {
      const response = await fetch(`/api/ai/actions/${actionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.action) {
          setActions((current) => ({
            ...current,
            [opportunityId]: data.action,
          }));
        }
        throw new Error(data.error || "Não foi possível atualizar a ação.");
      }
      setActions((current) => ({
        ...current,
        [opportunityId]: {
          ...current[opportunityId],
          ...data,
        },
      }));
    } catch (error) {
      setActionFeedback(
        error instanceof Error ? error.message : "Não foi possível atualizar a ação."
      );
    } finally {
      setProcessingAction(null);
    }
  }

  async function openOpportunity(opportunity: Opportunity) {
    const requestId = ++historyRequestIdRef.current;
    setSelectedOpportunity(opportunity);
    setClientHistory(null);
    setHistoryError("");
    setHistoryLoading(Boolean(opportunity.client_id));
    setActionFeedback("");
    setMessageError("");
    setWhatsappFeedback("");
    if (!opportunity.client_id) return;

    try {
      const response = await fetch(`/api/clients/${opportunity.client_id}/profile`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível carregar o histórico do cliente.");
      }
      if (requestId === historyRequestIdRef.current) {
        setClientHistory(data as ClientHistory);
      }
    } catch (error) {
      if (requestId === historyRequestIdRef.current) {
        setHistoryError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o histórico do cliente."
        );
      }
    } finally {
      if (requestId === historyRequestIdRef.current) {
        setHistoryLoading(false);
      }
    }
  }

  async function generateSuggestedMessage(opportunityId: string) {
    setMessageLoadingId(opportunityId);
    setMessageError("");
    try {
      const { message, fallback } = await requestSuggestedMessage(opportunityId);
      setSuggestedMessages((current) => ({
        ...current,
        [opportunityId]: message,
      }));
      setMessageFallback((current) => ({ ...current, [opportunityId]: fallback }));
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : "Não foi possível gerar a mensagem."
      );
    } finally {
      setMessageLoadingId(null);
    }
  }

  async function recordWhatsAppOpened(opportunity: Opportunity, message: string) {
    if (!opportunity.client_id) return;
    setWhatsappFeedback("");
    try {
      const response = await fetch("/api/ai/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          opportunityId: opportunity.id,
          clientId: opportunity.client_id,
          type: "whatsapp_opened",
          payload: { message },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível registrar a abertura.");
      }
      setWhatsappFeedback(
        "WhatsApp aberto. O envio da mensagem não é confirmado pelo EstetiQi."
      );
    } catch (error) {
      setWhatsappFeedback(
        error instanceof Error
          ? `WhatsApp aberto, mas a ação não foi registrada: ${error.message}`
          : "WhatsApp aberto, mas não foi possível registrar a ação."
      );
    }
  }

  function closeOpportunity() {
    historyRequestIdRef.current += 1;
    setSelectedOpportunity(null);
    setClientHistory(null);
    setHistoryLoading(false);
    setHistoryError("");
  }

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return load();
      return undefined;
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const dialog = opportunityDialogRef.current;
    if (!selectedOpportunity || !dialog) return;

    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [selectedOpportunity]);

  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const visibleOpportunities = opportunities.filter(
    (opportunity) =>
      !wasRejectedForSameReason(opportunity, actions[opportunity.id])
  );
  const opportunityActions = Object.fromEntries(
    Object.entries(actions).filter(([opportunityId, action]) => {
      if (action.status !== "cancelled") return true;
      const opportunity = opportunities.find((item) => item.id === opportunityId);
      return !opportunity || !wasRejectedForSameReason(opportunity, action);
    })
  );
  const rejectedActions = Object.values(actions).filter(
    (action) => action.status === "cancelled"
  );
  const selectedAction = selectedOpportunity
    ? opportunityActions[selectedOpportunity.id]
    : undefined;
  const selectedMessage = selectedOpportunity
    ? suggestedMessages[selectedOpportunity.id]?.trim() ?? ""
    : "";
  const selectedWhatsappUrl =
    selectedOpportunity?.client_id && clientHistory && selectedMessage
      ? buildWhatsAppUrl({
          name: clientHistory.client.name,
          phone: clientHistory.client.phone,
          lastProcedureName: clientHistory.totals.last_procedure,
          message: selectedMessage,
        })
      : null;
  const priorityLabels = {
    low: "Baixa",
    medium: "Média",
    high: "Alta",
  };

  if (loading) {
    return (
      <main className="p-6">
        <p className="text-sm text-gray-500">Carregando inteligência...</p>
      </main>
    );
  }

  return (
    <main className="app-main-min-h bg-[#fbfaf8] px-4 py-7 text-[#26352f] sm:px-6 sm:py-9 lg:px-8">
      <div className="mx-auto max-w-7xl">
      <header className="mb-7">
        <h1 className="text-3xl font-semibold tracking-tight text-[#30463c]">Assistente IA</h1>
        <p className="mt-2 text-sm leading-6 text-[#78867f]">
          O que merece atenção no negócio agora.
        </p>
      </header>

      {metrics && (
        <section className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-sm text-gray-500">Clientes pagantes</p>
            <p className="mt-2 text-xl font-semibold">
              {metrics.payingClients}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-sm text-gray-500">Variação da receita</p>
            <p className="mt-2 text-xl font-semibold">
              {metrics.revenueChange === null
                ? "—"
                : `${metrics.revenueChange.toFixed(1)}%`}
            </p>
          </div>
        </section>
      )}

      {actionFeedback && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {actionFeedback}
        </p>
      )}
      {pageError && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {pageError}
        </p>
      )}

      <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Oportunidades</h2>
            <p className="mt-1 text-sm text-[#78867f]">
              Veja quem ou o que merece atenção, entenda o motivo e escolha o próximo passo.
            </p>
          </div>

          <button
            onClick={generateOpportunities}
            disabled={generating}
            className="rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {generating ? "Analisando..." : "Analisar agora"}
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {visibleOpportunities.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nenhuma oportunidade nova para revisar agora.
            </p>
          ) : (
            visibleOpportunities.map((opportunity) => (
              <button
                type="button"
                key={opportunity.id}
                onClick={() => void openOpportunity(opportunity)}
                className="block w-full rounded-xl border border-[#e4ebe7] p-4 text-left transition hover:border-[#bccfc3] hover:bg-[#fafcfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#527765] sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="mt-1 font-semibold text-[#30463c]">
                      {opportunity.client_name ??
                        opportunity.data?.target?.name ??
                        (opportunity.client_id ? "Cliente não disponível" : opportunity.title)}
                    </h3>
                    <p className="mt-1 text-sm text-[#52635b]">{opportunity.title}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#edf3ef] px-2 py-1 text-xs text-[#50655b]">
                    Prioridade {priorityLabels[opportunity.priority]}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-5 text-[#78867f]">
                  {opportunity.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#eef2ef] pt-3">
                  <span className="text-xs text-[#78867f]">
                    {opportunityActions[opportunity.id]
                      ? opportunityActions[opportunity.id].status === "pending_approval"
                        ? "Aguardando sua aprovação"
                        : opportunityActions[opportunity.id].status === "approved"
                          ? "Aprovada — pronta para executar"
                          : opportunityActions[opportunity.id].status === "failed"
                            ? "A ação não foi concluída"
                            : "Ação em andamento"
                      : "Ainda não há uma ação criada"}
                  </span>
                  <span className="text-sm font-semibold text-[#30463c]">
                    Ver detalhes e agir →
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {selectedOpportunity && (
          <dialog
            ref={opportunityDialogRef}
            aria-labelledby="opportunity-detail-title"
            className="fixed inset-0 m-auto max-h-[min(92dvh,900px)] w-[min(94vw,760px)] max-w-none overflow-y-auto rounded-2xl border border-[#e4ebe7] bg-[#fbfaf8] p-0 text-[#26352f] shadow-2xl backdrop:bg-black/40"
            onCancel={(event) => {
              event.preventDefault();
              closeOpportunity();
            }}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e4ebe7] bg-[#fbfaf8] p-5 sm:p-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#78867f]">
                  {selectedOpportunity.client_id ? "Oportunidade de cliente" : "Oportunidade do negócio"}
                </p>
                <h2 id="opportunity-detail-title" className="mt-1 text-xl font-semibold text-[#30463c]">
                  {selectedOpportunity.client_name ??
                    selectedOpportunity.data?.target?.name ??
                    selectedOpportunity.title}
                </h2>
                <p className="mt-1 text-sm text-[#78867f]">{selectedOpportunity.title}</p>
              </div>
              <button
                type="button"
                autoFocus
                onClick={closeOpportunity}
                aria-label="Fechar detalhes da oportunidade"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#dce5e0] text-lg"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <section className="rounded-xl border border-[#e4ebe7] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-[#30463c]">Por que merece atenção</h3>
                  <span className="rounded-full bg-[#edf3ef] px-3 py-1 text-xs text-[#50655b]">
                    Prioridade {priorityLabels[selectedOpportunity.priority]}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#52635b]">
                  {selectedOpportunity.description}
                </p>
                <h4 className="mt-4 text-sm font-semibold text-[#30463c]">O que recomendamos</h4>
                <p className="mt-1 text-sm leading-6 text-[#52635b]">
                  {selectedOpportunity.data?.suggestedAction ??
                    "Revise os dados e escolha a ação mais adequada para o negócio."}
                </p>
              </section>

              {selectedOpportunity.client_id && (
                <section className="rounded-xl border border-[#e4ebe7] bg-white p-4">
                  <h3 className="font-semibold text-[#30463c]">Histórico do cliente</h3>
                  {historyLoading ? (
                    <p className="mt-2 text-sm text-[#78867f]">Carregando histórico...</p>
                  ) : historyError ? (
                    <p role="alert" className="mt-2 text-sm text-red-700">{historyError}</p>
                  ) : clientHistory ? (
                    <>
                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-[#78867f]">Último atendimento concluído</dt>
                          <dd className="mt-1 text-sm font-medium">
                            {clientHistory.totals.last_appointment_at
                              ? new Date(clientHistory.totals.last_appointment_at).toLocaleDateString("pt-BR")
                              : "Sem atendimento concluído"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[#78867f]">{labels.singular} mais recente</dt>
                          <dd className="mt-1 text-sm font-medium">
                            {clientHistory.totals.last_procedure ?? "Não informado"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[#78867f]">Atendimentos concluídos</dt>
                          <dd className="mt-1 text-sm font-medium">{clientHistory.totals.completed_count}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[#78867f]">Intervalo esperado de retorno</dt>
                          <dd className="mt-1 text-sm font-medium">
                            {selectedOpportunity.data?.returnIntervalDays ??
                            clientHistory.totals.return_interval_days
                              ? `${selectedOpportunity.data?.returnIntervalDays ?? clientHistory.totals.return_interval_days} dias`
                              : "Não informado"}
                          </dd>
                        </div>
                      </dl>

                      {clientHistory.appointments.length > 0 && (
                        <details className="mt-4 border-t border-[#eef2ef] pt-3">
                          <summary className="cursor-pointer text-sm font-semibold text-[#52635b]">
                            Ver atendimentos recentes
                          </summary>
                          <ul className="mt-3 divide-y divide-[#eef2ef]">
                            {clientHistory.appointments.slice(0, 6).map((appointment) => (
                              <li key={appointment.id} className="py-2 text-sm">
                                <p className="font-medium text-[#30463c]">
                                  {appointment.procedure_name ?? `${labels.singular} não informado`}
                                </p>
                                <p className="mt-1 text-xs text-[#78867f]">
                                  {new Date(appointment.starts_at).toLocaleDateString("pt-BR")} · {appointment.status === "completed" ? "Concluído" : appointment.status === "no_show" ? "Não compareceu" : appointment.status === "cancelled" ? "Cancelado" : appointment.status === "confirmed" ? "Confirmado" : "Agendado"}
                                  {appointment.professional_name ? ` · ${appointment.professional_name}` : ""}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-[#78867f]">O histórico do cliente não está disponível.</p>
                  )}
                </section>
              )}

              <section className="rounded-xl border border-[#e4ebe7] bg-white p-4">
                <h3 className="font-semibold text-[#30463c]">Próximo passo</h3>
                <p className="mt-2 text-sm leading-6 text-[#52635b]">
                  {selectedOpportunity.type === "client_return"
                    ? "Prepare uma mensagem pessoal e revise o texto antes de abrir o WhatsApp. Nenhuma mensagem é enviada automaticamente."
                    : "Revise a recomendação e escolha se deseja criar uma ação para aprovação."}
                </p>
                {selectedOpportunity.type === "client_return" && (
                  <>
                    <div className="mt-4 rounded-xl border border-[#eef2ef] bg-[#fafcfb] p-3">
                      <h4 className="text-sm font-semibold text-[#30463c]">Mensagem sugerida</h4>
                      <label className="mt-2 block text-sm text-[#52635b]">
                        Revise ou edite antes de abrir o WhatsApp
                        <textarea
                          aria-label="Revise ou edite a mensagem"
                          rows={4}
                          maxLength={500}
                          value={suggestedMessages[selectedOpportunity.id] ?? ""}
                          onChange={(event) =>
                            setSuggestedMessages((current) => ({
                              ...current,
                              [selectedOpportunity.id]: event.target.value,
                            }))
                          }
                          placeholder="Gere uma sugestão com base no histórico real da cliente. Você poderá revisar e editar o texto aqui."
                          className="mt-2 w-full rounded-xl border border-[#dce5e0] bg-white p-3 text-sm leading-6"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void generateSuggestedMessage(selectedOpportunity.id)}
                        disabled={messageLoadingId === selectedOpportunity.id}
                        className="mt-3 min-h-10 rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold text-[#30463c] disabled:opacity-50"
                      >
                        {messageLoadingId === selectedOpportunity.id
                          ? "Preparando mensagem..."
                          : suggestedMessages[selectedOpportunity.id]
                            ? "Gerar outra sugestão"
                            : "Gerar mensagem sugerida"}
                      </button>
                      {messageError && (
                        <p role="alert" className="mt-2 text-sm text-red-700">{messageError}</p>
                      )}
                      {selectedMessage && messageFallback[selectedOpportunity.id] && (
                        <p role="status" className="mt-2 text-sm text-[#52635b]">
                          A IA está indisponível agora. Preparamos uma sugestão-padrão com base no histórico real — revise antes de enviar.
                        </p>
                      )}
                    </div>
                    {selectedWhatsappUrl ? (
                      <a
                        href={selectedWhatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          void recordWhatsAppOpened(selectedOpportunity, selectedMessage)
                        }
                        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#25382f]"
                      >
                        Abrir WhatsApp
                      </a>
                    ) : (
                      <p className="mt-3 text-sm text-[#78867f]">
                        {!selectedMessage
                          ? "Gere e revise a mensagem para liberar a abertura do WhatsApp."
                          : historyLoading
                            ? "Carregando os dados da cliente..."
                            : !clientHistory
                              ? "Não foi possível carregar os dados da cliente para abrir o WhatsApp."
                              : "Não há um telefone válido cadastrado para esta cliente."}
                      </p>
                    )}
                    {whatsappFeedback && (
                      <p role="status" className="mt-2 text-sm text-[#52635b]">
                        {whatsappFeedback}
                      </p>
                    )}
                  </>
                )}
              </section>

              {selectedAction?.status === "failed" && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  Não foi possível concluir esta ação. Ela não foi executada.
                </p>
              )}
              {selectedAction?.status === "cancelled" && (
                <p role="status" className="rounded-xl bg-[#f1f3f2] p-3 text-sm text-[#52635b]">
                  Ação recusada e mantida no histórico.
                </p>
              )}
              {selectedAction && selectedAction.status !== "cancelled" && (
                <p role="status" className="text-sm font-medium text-[#52635b]">
                  {selectedAction.status === "pending_approval"
                    ? "Aguardando sua aprovação"
                    : selectedAction.status === "approved"
                      ? "Aprovada — pronta para executar"
                      : selectedAction.status === "completed"
                        ? "Ação concluída"
                        : selectedAction.status === "failed"
                          ? "A ação não foi concluída"
                          : "Ação em andamento"}
                </p>
              )}

              <div className="flex flex-wrap gap-2 border-t border-[#e4ebe7] pt-4">
                {!selectedAction && (
                  <button
                    type="button"
                    onClick={() => void createAction(selectedOpportunity)}
                    disabled={creatingAction === selectedOpportunity.id}
                    className="min-h-10 rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {creatingAction === selectedOpportunity.id ? "Criando..." : "Criar ação para revisar"}
                  </button>
                )}
                {selectedAction?.status === "pending_approval" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void processAction(selectedOpportunity.id, selectedAction.id, "approved")}
                      disabled={processingAction === selectedAction.id}
                      className="min-h-10 rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => void processAction(selectedOpportunity.id, selectedAction.id, "cancelled")}
                      disabled={processingAction === selectedAction.id}
                      className="min-h-10 rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      Recusar ação
                    </button>
                  </>
                )}
                {selectedAction?.status === "approved" && (
                  <button
                    type="button"
                    onClick={() => void processAction(selectedOpportunity.id, selectedAction.id, "execute")}
                    disabled={processingAction === selectedAction.id}
                    className="min-h-10 rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {processingAction === selectedAction.id ? "Executando..." : "Executar ação"}
                  </button>
                )}
                {selectedAction?.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => void createAction(selectedOpportunity)}
                    disabled={creatingAction === selectedOpportunity.id}
                    className="min-h-10 rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    Criar nova ação
                  </button>
                )}
                {selectedAction && !["pending_approval", "approved", "failed", "cancelled"].includes(selectedAction.status) && (
                  <span className="rounded-full bg-[#edf3ef] px-3 py-2 text-sm text-[#50655b]">
                    {selectedAction.status === "completed" ? "Ação concluída" : "Ação em andamento"}
                  </span>
                )}
              </div>
              {actionFeedback && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {actionFeedback}
                </p>
              )}
            </div>
          </dialog>
        )}

        {rejectedActions.length > 0 && (
          <details className="mt-5 rounded-xl border border-[#e4ebe7] bg-[#fafcfb] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[#52635b]">
              Ações recusadas ({rejectedActions.length}) — mantidas no histórico
            </summary>
            <ul className="mt-3 space-y-3">
              {rejectedActions.map((action) => (
                <li key={action.id} className="border-t border-[#e4ebe7] pt-3">
                  <p className="text-sm font-medium text-[#30463c]">
                    {action.payload?.opportunity?.title ?? "Ação recusada"}
                  </p>
                  {action.payload?.opportunity?.description && (
                    <p className="mt-1 text-sm text-[#78867f]">
                      {action.payload.opportunity.description}
                    </p>
                  )}
                  {action.created_at && (
                    <p className="mt-1 text-xs text-[#8a9891]">
                      Recusada em {new Date(action.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {metrics && metrics.professionals.length > 0 && (
        <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
          <h2 className="font-semibold">Profissionais</h2>

          <div className="mt-4 divide-y">
            {metrics.professionals.map((professional) => (
              <div
                key={professional.professionalName}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-medium">
                    {professional.professionalName}
                  </p>
                  <p className="text-sm text-gray-500">
                    {professional.appointments} atendimentos
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-medium">
                    {money(professional.revenue)}
                  </p>
                  <p className="text-xs text-gray-500">
                    ticket {money(professional.ticketAverage)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      </div>
    </main>
  );
}
