"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useProcedureLabels } from "../procedure-labels";
import { WhatsAppMessageDialog } from "../whatsapp-message-dialog";
import {
  buildAppointmentConfirmationMessage,
  buildPostAttendanceMessage,
  buildReturnMessage,
  formatAppointmentMoment,
  hasValidContactPhone,
  type CommunicationCategory,
} from "@/lib/communication/messages";

// Central de Comunicação — operações de mensagens e WhatsApp.
//
// Esta tela EXECUTA, organiza e acompanha as ações de comunicação. Ela não
// reproduz o painel de oportunidades do Assistente IA: apenas recebe os
// resultados da lógica de retorno já existente (/api/ai/opportunities) e oferece
// os recursos para falar com a cliente.
//
// Honestidade das informações:
// - Nenhuma mensagem é enviada automaticamente. A profissional revisa o texto e
//   abre o WhatsApp (wa.me). Abrir o WhatsApp NÃO confirma o envio.
// - O estado da integração oficial do WhatsApp é real: sem credenciais ele é
//   "Não configurado" e nenhuma chamada externa é feita.
// - O histórico persistente ainda não está ativo (ver a aba "Histórico").

const TIME_ZONE = "America/Sao_Paulo";

type Appointment = {
  id: string;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  procedure_name: string | null;
  professional_name: string | null;
  starts_at: string;
  status: string;
  procedures?: { name: string | null }[];
};

type ReturnClient = {
  id: string;
  name: string;
  phone: string | null;
  last_procedure_name: string | null;
  inactive_days: number;
  priority: "low" | "medium" | "high";
};

type DialogState = {
  key: string;
  title: string;
  recipientName: string;
  phone: string | null;
  initialMessage: string;
  category: CommunicationCategory;
  context?: string;
};

// Abas da Central. Cada uma foca um tipo de operação de comunicação.
const TABS = [
  { id: "overview", label: "Visão geral" },
  { id: "confirmations", label: "Agendamentos" },
  { id: "post", label: "Pós-atendimento" },
  { id: "returns", label: "Retorno de clientes" },
  { id: "whatsapp", label: "WhatsApp e configurações" },
  { id: "history", label: "Histórico" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Estado da integração oficial, conforme devolvido por
// /api/communication/whatsapp (nunca contém segredos).
type WhatsAppStatus = {
  provider: string;
  configured: boolean;
  credentials: Record<string, boolean>;
  missing: { key: string; label: string; envKey: string }[];
  webhookReady: boolean;
  connection: "not_configured" | "unverified" | "ok" | "error";
  connectionMessage: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  lastCheckedAt: string;
  docsUrl: string;
};

function todayInTimeZone() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00-03:00`);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatSlot(startsAt: string) {
  const { dateLabel, timeLabel } = formatAppointmentMoment(startsAt);
  if (!dateLabel) return "Data não informada";
  return timeLabel ? `${dateLabel}, às ${timeLabel}` : dateLabel;
}

function appointmentProcedureLabel(appointment: Appointment, fallback: string) {
  if (appointment.procedure_name) return appointment.procedure_name;
  const names = (appointment.procedures ?? [])
    .map((procedure) => procedure.name)
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(", ") : fallback;
}

const priorityLabels = {
  high: "Prioridade alta",
  medium: "Prioridade média",
  low: "Prioridade baixa",
};

type CommunicationData = {
  businessName: string | null;
  appointments: Appointment[];
  returns: ReturnClient[];
};

// Carrega, em paralelo, o que a Central precisa: nome do negócio, atendimentos
// recentes/futuros e contatos de retorno (regras do Assistente IA). Cada
// consulta falha de forma isolada para não derrubar a tela inteira.
async function fetchCommunicationData(): Promise<CommunicationData> {
  const today = todayInTimeZone();
  const [organization, appointmentsResult, returnsResult] = await Promise.all([
    fetch("/api/organization")
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null),
    fetch(
      `/api/appointments?from=${shiftDate(today, -30)}&to=${shiftDate(today, 13)}`
    )
      .then((response) =>
        response.ok ? response.json() : { appointments: [] }
      )
      .catch(() => ({ appointments: [] })),
    fetch("/api/ai/opportunities?type=client_return")
      .then((response) => (response.ok ? response.json() : { clients: [] }))
      .catch(() => ({ clients: [] })),
  ]);

  return {
    businessName: organization?.name ?? null,
    appointments: Array.isArray(appointmentsResult?.appointments)
      ? (appointmentsResult.appointments as Appointment[])
      : [],
    returns: Array.isArray(returnsResult?.clients)
      ? (returnsResult.clients as ReturnClient[])
      : [],
  };
}

// Rótulo legível e classe de cor do estado da integração oficial.
const WHATSAPP_STATE_LABELS: Record<WhatsAppStatus["connection"], string> = {
  not_configured: "Não configurado",
  unverified: "Credenciais incompletas",
  ok: "Conectado (verificado)",
  error: "Falha na verificação",
};

const WHATSAPP_STATE_TONES: Record<WhatsAppStatus["connection"], string> = {
  not_configured: "bg-[#f4f7f5] text-[#52635b]",
  unverified: "bg-amber-50 text-amber-800",
  ok: "bg-[#edf7ef] text-[#477152]",
  error: "bg-red-50 text-red-700",
};

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl bg-[#fafcfb] p-4 text-sm text-[#78867f]">
      {children}
    </p>
  );
}

export default function ComunicacaoPage() {
  const labels = useProcedureLabels();
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  // Instante da última carga, capturado fora do render, para separar
  // atendimentos futuros dos concluídos sem chamar Date durante a renderização.
  const [nowMs, setNowMs] = useState(0);
  const [returns, setReturns] = useState<ReturnClient[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus | null>(null);
  const [whatsappError, setWhatsappError] = useState("");

  useEffect(() => {
    let active = true;
    fetchCommunicationData()
      .then((data) => {
        if (!active) return;
        setBusinessName(data.businessName);
        setAppointments(data.appointments);
        setReturns(data.returns);
        setNowMs(Date.now());
        setError("");
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Não foi possível carregar a Central de Comunicação.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Estado da integração oficial. É uma consulta independente: uma falha aqui
  // não impede o uso das mensagens manuais (wa.me).
  useEffect(() => {
    let active = true;
    fetch("/api/communication/whatsapp")
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Não foi possível carregar o estado da integração."
          );
        }
        return data as WhatsAppStatus;
      })
      .then((data) => {
        if (!active) return;
        setWhatsapp(data);
        setWhatsappError("");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setWhatsappError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar o estado da integração."
        );
      });
    return () => {
      active = false;
    };
  }, []);

  async function retry() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCommunicationData();
      setBusinessName(data.businessName);
      setAppointments(data.appointments);
      setReturns(data.returns);
      setNowMs(Date.now());
      setError("");
    } catch {
      setError("Não foi possível carregar a Central de Comunicação.");
    } finally {
      setLoading(false);
    }
  }

  const upcoming = useMemo(
    () =>
      appointments
        .filter(
          (appointment) =>
            ["scheduled", "confirmed"].includes(appointment.status) &&
            new Date(appointment.starts_at).getTime() >= nowMs
        )
        .sort(
          (a, b) =>
            new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
        ),
    [appointments, nowMs]
  );

  const completed = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.status === "completed")
        .sort(
          (a, b) =>
            new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
        ),
    [appointments]
  );

  function openConfirmation(appointment: Appointment) {
    const procedureLabel = appointmentProcedureLabel(appointment, "");
    setDialog({
      key: `confirm-${appointment.id}`,
      title: "Confirmação de agendamento",
      recipientName: appointment.client_name,
      phone: appointment.client_phone,
      category: "transacional",
      context: formatSlot(appointment.starts_at),
      initialMessage: buildAppointmentConfirmationMessage({
        clientName: appointment.client_name,
        procedureName: procedureLabel || null,
        professionalName: appointment.professional_name,
        businessName,
        startsAt: appointment.starts_at,
      }),
    });
  }

  function openPostAttendance(appointment: Appointment) {
    const procedureLabel = appointmentProcedureLabel(appointment, "");
    setDialog({
      key: `post-${appointment.id}`,
      title: "Mensagem pós-atendimento",
      recipientName: appointment.client_name,
      phone: appointment.client_phone,
      category: "pos_atendimento",
      context: formatSlot(appointment.starts_at),
      initialMessage: buildPostAttendanceMessage({
        clientName: appointment.client_name,
        procedureName: procedureLabel || null,
        businessName,
      }),
    });
  }

  function openReturn(client: ReturnClient) {
    setDialog({
      key: `return-${client.id}`,
      title: "Contato de retorno",
      recipientName: client.name,
      phone: client.phone,
      category: "promocional",
      context: `Sem atendimento registrado há ${client.inactive_days} dias`,
      initialMessage: buildReturnMessage({
        clientName: client.name,
        lastProcedureName: client.last_procedure_name,
      }),
    });
  }

  return (
    <main className="app-main-min-h bg-[#fbfaf8] px-4 py-7 text-[#26352f] sm:px-6 sm:py-9 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-[#30463c]">
            Central de Comunicação
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#78867f]">
            Prepare, revise e acompanhe as mensagens com suas clientes. Nenhuma
            mensagem é enviada automaticamente: você revisa o texto e abre o
            WhatsApp quando quiser.
          </p>
        </header>

        <div className="mb-6 rounded-2xl border border-[#e4ebe7] bg-white p-4 text-sm text-[#52635b]">
          <p>
            <span className="font-semibold text-[#30463c]">Como funciona:</span>{" "}
            escolha uma seção, revise a mensagem sugerida, copie se preferir e
            abra o WhatsApp. O link é gerado apenas quando há um telefone válido
            cadastrado.
          </p>
          <p className="mt-2 text-xs text-[#8a9891]">
            Abrir o WhatsApp não confirma o envio. As marcações de estado
            (“Preparada”, “WhatsApp aberto”, “Envio manual confirmado”) valem
            apenas nesta sessão, porque ainda não há histórico de comunicação
            persistido no sistema.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void retry()}
              className="mt-2 font-semibold underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[#8a9891]">
            Carregando a Central de Comunicação...
          </p>
        ) : (
          <div className="space-y-6">
            <div
              role="tablist"
              aria-label="Seções da Central de Comunicação"
              className="flex flex-wrap gap-2 border-b border-[#e4ebe7] pb-2"
            >
              {TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`tab-${item.id}`}
                    aria-selected={active}
                    aria-controls={`panel-${item.id}`}
                    onClick={() => setTab(item.id)}
                    className={`min-h-10 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? "bg-[#edf3ef] text-[#30463c]"
                        : "text-[#52635b] hover:bg-[#f4f7f5]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div
              id={`panel-${tab}`}
              role="tabpanel"
              aria-labelledby={`tab-${tab}`}
              className="space-y-6"
            >
              {tab === "overview" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        label: "Agendamentos futuros",
                        value: String(upcoming.length),
                        detail: "que podem precisar de confirmação",
                      },
                      {
                        label: "Atendimentos concluídos",
                        value: String(completed.length),
                        detail: "recentes, elegíveis para pós-atendimento",
                      },
                      {
                        label: "Contatos de retorno",
                        value: String(returns.length),
                        detail: "sugeridos pelas regras do Assistente IA",
                      },
                      {
                        label: "WhatsApp oficial",
                        value: whatsapp
                          ? WHATSAPP_STATE_LABELS[whatsapp.connection]
                          : whatsappError
                            ? "Indisponível"
                            : "Verificando...",
                        detail: whatsapp?.configured
                          ? "credenciais presentes no servidor"
                          : "integração da Meta ainda não configurada",
                      },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-2xl border border-[#e4ebe7] bg-white p-5"
                      >
                        <p className="text-sm font-medium text-[#78867f]">
                          {metric.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold tracking-tight text-[#30463c]">
                          {metric.value}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#8a9891]">
                          {metric.detail}
                        </p>
                      </div>
                    ))}
                  </div>

                  <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-[#30463c]">
                      Como a Central funciona
                    </h2>
                    <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[#52635b]">
                      <li>Escolha uma seção nas abas acima.</li>
                      <li>Selecione a cliente e revise a mensagem sugerida.</li>
                      <li>
                        Copie o texto ou abra o WhatsApp (wa.me) para enviar.
                      </li>
                      <li>
                        Marque o estado para acompanhar o que já foi tratado.
                      </li>
                    </ol>
                    <p className="mt-3 text-xs text-[#8a9891]">
                      As oportunidades continuam sendo identificadas pelo
                      Assistente IA; esta Central apenas executa e acompanha a
                      comunicação. O histórico persistente ainda não está ativo:
                      as marcações valem apenas nesta sessão.
                    </p>
                  </section>
                </>
              )}

              {tab === "confirmations" && (
                <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-[#30463c]">
                      Confirmações de agendamento
                    </h2>
                    <span className="rounded-full bg-[#edf3ef] px-2.5 py-1 text-xs font-semibold text-[#50655b]">
                      Transacional
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#78867f]">
                    Atendimentos futuros que podem precisar de confirmação.
                  </p>
                  {upcoming.length === 0 ? (
                    <EmptyState>
                      Nenhum agendamento futuro para confirmar no momento.
                    </EmptyState>
                  ) : (
                    <ul className="mt-4 divide-y divide-[#eef2ef]">
                      {upcoming.map((appointment) => (
                        <li
                          key={appointment.id}
                          className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-[#30463c]">
                              {appointment.client_name}
                            </p>
                            <p className="mt-0.5 text-sm text-[#78867f]">
                              {formatSlot(appointment.starts_at)} ·{" "}
                              {appointmentProcedureLabel(
                                appointment,
                                `${labels.singular} não informado`
                              )}
                            </p>
                            {!hasValidContactPhone(appointment.client_phone) && (
                              <p className="mt-1 text-xs text-amber-700">
                                Sem telefone/WhatsApp válido cadastrado — ainda é
                                possível copiar o texto.
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => openConfirmation(appointment)}
                            className="min-h-11 shrink-0 rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold text-[#30463c] hover:bg-[#f4f7f5]"
                          >
                            Preparar confirmação
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {tab === "post" && (
                <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-[#30463c]">
                      Acompanhamento pós-atendimento
                    </h2>
                    <span className="rounded-full bg-[#edf3ef] px-2.5 py-1 text-xs font-semibold text-[#50655b]">
                      Pós-atendimento
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#78867f]">
                    Atendimentos concluídos recentemente. A mensagem abre espaço
                    para dúvidas e não afirma que documentos foram enviados.
                  </p>
                  {completed.length === 0 ? (
                    <EmptyState>
                      Nenhum atendimento concluído nos últimos 30 dias.
                    </EmptyState>
                  ) : (
                    <ul className="mt-4 divide-y divide-[#eef2ef]">
                      {completed.map((appointment) => (
                        <li
                          key={appointment.id}
                          className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-[#30463c]">
                              {appointment.client_name}
                            </p>
                            <p className="mt-0.5 text-sm text-[#78867f]">
                              {formatSlot(appointment.starts_at)} ·{" "}
                              {appointmentProcedureLabel(
                                appointment,
                                `${labels.singular} não informado`
                              )}
                            </p>
                            {!hasValidContactPhone(appointment.client_phone) && (
                              <p className="mt-1 text-xs text-amber-700">
                                Sem telefone/WhatsApp válido cadastrado.
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => openPostAttendance(appointment)}
                            className="min-h-11 shrink-0 rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold text-[#30463c] hover:bg-[#f4f7f5]"
                          >
                            Preparar mensagem
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {tab === "returns" && (
                <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-[#30463c]">
                      Retorno de clientes
                    </h2>
                    <span className="rounded-full bg-[#edf7ef] px-2.5 py-1 text-xs font-semibold text-[#477152]">
                      Reativação
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#78867f]">
                    Clientes sugeridas pelas mesmas regras de retorno e clientes
                    inativos do Assistente IA. Revise e edite a mensagem antes de
                    enviar.
                  </p>
                  {returns.length === 0 ? (
                    <EmptyState>
                      Nenhuma cliente para contato de retorno no momento.{" "}
                      <Link
                        href="/app/inteligencia"
                        className="font-semibold text-[#30463c] underline"
                      >
                        Abrir o Assistente IA
                      </Link>
                      .
                    </EmptyState>
                  ) : (
                    <ul className="mt-4 divide-y divide-[#eef2ef]">
                      {returns.map((client) => (
                        <li
                          key={client.id}
                          className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-[#30463c]">
                              {client.name}
                            </p>
                            <p className="mt-0.5 text-sm text-[#78867f]">
                              {client.last_procedure_name ??
                                `${labels.singular} anterior não informado`}{" "}
                              · sem atendimento há {client.inactive_days} dias
                            </p>
                            <span className="mt-1 inline-flex rounded-full bg-[#f4f7f5] px-2 py-0.5 text-xs font-medium text-[#52635b]">
                              {priorityLabels[client.priority]}
                            </span>
                            {!hasValidContactPhone(client.phone) && (
                              <p className="mt-1 text-xs text-amber-700">
                                Sem telefone/WhatsApp válido cadastrado.
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => openReturn(client)}
                            className="min-h-11 shrink-0 rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold text-[#30463c] hover:bg-[#f4f7f5]"
                          >
                            Preparar retorno
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-[#8a9891]">
                    Fonte: as mesmas regras de retorno e clientes inativos do
                    Assistente IA. O sistema não registra consentimento de
                    marketing — a decisão de contatar é da profissional, e a
                    ausência de um registro não significa autorização.
                  </p>
                </section>
              )}

              {tab === "whatsapp" && (
                <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-[#30463c]">
                      WhatsApp e configurações
                    </h2>
                    {whatsapp ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          WHATSAPP_STATE_TONES[whatsapp.connection]
                        }`}
                      >
                        {WHATSAPP_STATE_LABELS[whatsapp.connection]}
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#f4f7f5] px-2.5 py-1 text-xs font-semibold text-[#52635b]">
                        {whatsappError ? "Indisponível" : "Verificando..."}
                      </span>
                    )}
                  </div>

                  {whatsappError ? (
                    <p
                      role="alert"
                      className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
                    >
                      {whatsappError}
                    </p>
                  ) : !whatsapp ? (
                    <p className="mt-3 text-sm text-[#78867f]">
                      Verificando a configuração...
                    </p>
                  ) : (
                    <>
                      <p className="mt-3 text-sm text-[#52635b]">
                        {whatsapp.connectionMessage}
                      </p>

                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold text-[#78867f]">
                            Número conectado
                          </dt>
                          <dd className="mt-0.5 text-[#30463c]">
                            {whatsapp.displayPhoneNumber ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-[#78867f]">
                            Nome verificado
                          </dt>
                          <dd className="mt-0.5 text-[#30463c]">
                            {whatsapp.verifiedName ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-[#78867f]">
                            Webhooks
                          </dt>
                          <dd className="mt-0.5 text-[#30463c]">
                            {whatsapp.webhookReady
                              ? "Pronto para validação"
                              : "Não configurado"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-[#78867f]">
                            Última verificação
                          </dt>
                          <dd className="mt-0.5 text-[#30463c]">
                            {new Date(whatsapp.lastCheckedAt).toLocaleString(
                              "pt-BR"
                            )}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4 rounded-xl border border-[#e4ebe7] p-4">
                        <p className="text-xs font-semibold text-[#78867f]">
                          Credenciais do servidor
                        </p>
                        {whatsapp.missing.length === 0 ? (
                          <p className="mt-1 text-sm text-[#477152]">
                            Todas as credenciais necessárias estão presentes.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-1 text-sm text-[#52635b]">
                            {whatsapp.missing.map((item) => (
                              <li key={item.key}>
                                Falta: {item.label} —{" "}
                                <code className="rounded bg-[#f4f7f5] px-1 text-xs text-[#30463c]">
                                  {item.envKey}
                                </code>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {!whatsapp.configured && (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                          <p className="font-semibold">
                            Integração não configurada.
                          </p>
                          <p className="mt-1">
                            Enquanto as credenciais da WhatsApp Business Cloud
                            API não estiverem definidas no servidor, o envio pela
                            API oficial não é habilitado. A preparação e a
                            abertura do WhatsApp (wa.me) continuam funcionando
                            normalmente.
                          </p>
                          <p className="mt-2">
                            As credenciais devem ficar apenas no servidor
                            (variáveis de ambiente), nunca no navegador nem no
                            código. Nenhum token é exibido nesta tela.
                          </p>
                          <a
                            href={whatsapp.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block font-semibold underline"
                          >
                            Abrir a documentação da Meta
                          </a>
                        </div>
                      )}

                      <p className="mt-3 text-xs text-[#8a9891]">
                        O envio automático pela API oficial ainda não está
                        habilitado nesta versão. Uma mensagem só é considerada
                        enviada quando houver confirmação real do provedor.
                      </p>
                    </>
                  )}
                </section>
              )}

              {tab === "history" && (
                <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-[#30463c]">
                      Histórico de comunicações
                    </h2>
                    <span className="rounded-full bg-[#f4f7f5] px-2.5 py-1 text-xs font-semibold text-[#52635b]">
                      Não persistido
                    </span>
                  </div>
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-semibold">
                      O histórico persistente ainda não está ativo.
                    </p>
                    <p className="mt-1">
                      O registro permanente de mensagens (enviadas e recebidas),
                      com estado e identificador do provedor, depende de aplicar
                      a migration 033_communication_messages.sql no banco. Nesta
                      versão, as marcações de estado do diálogo valem apenas para
                      a sessão atual.
                    </p>
                  </div>
                  <p className="mt-3 text-xs text-[#8a9891]">
                    Abrir o WhatsApp não confirma o envio. Uma mensagem só será
                    considerada “enviada” quando houver confirmação real do
                    provedor.
                  </p>
                </section>
              )}
            </div>
          </div>
        )}
      </div>

      {dialog && (
        <WhatsAppMessageDialog
          key={dialog.key}
          title={dialog.title}
          recipientName={dialog.recipientName}
          phone={dialog.phone}
          initialMessage={dialog.initialMessage}
          category={dialog.category}
          context={dialog.context}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}
