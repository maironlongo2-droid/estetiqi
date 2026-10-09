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

type Procedure = {
  id: string;
  name: string;
  status: string;
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

function appointmentProcedureLabel(
  appointment: Appointment,
  fallback: string
) {
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
  procedures: Procedure[];
};

// Carrega, em paralelo, tudo o que a Central de Comunicação precisa: nome do
// negócio, atendimentos recentes/futuros, contatos de retorno e procedimentos.
// Cada consulta falha de forma isolada (a seção correspondente fica vazia) para
// não derrubar a tela inteira por causa de um endpoint indisponível. Função pura
// de módulo: quem chama aplica o resultado no estado dentro de um callback.
async function fetchCommunicationData(): Promise<CommunicationData> {
  const today = todayInTimeZone();
  const [organization, appointmentsResult, returnsResult, proceduresResult] =
    await Promise.all([
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
      fetch("/api/procedures?limit=100&status=active")
        .then((response) =>
          response.ok ? response.json() : { procedures: [] }
        )
        .catch(() => ({ procedures: [] })),
    ]);

  return {
    businessName: organization?.name ?? null,
    appointments: Array.isArray(appointmentsResult?.appointments)
      ? (appointmentsResult.appointments as Appointment[])
      : [],
    returns: Array.isArray(returnsResult?.clients)
      ? (returnsResult.clients as ReturnClient[])
      : [],
    procedures: Array.isArray(proceduresResult?.procedures)
      ? (proceduresResult.procedures as Procedure[])
      : [],
  };
}

export default function ComunicacaoPage() {
  const labels = useProcedureLabels();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  // Instante da última carga, capturado dentro do carregamento (fora do render)
  // para separar atendimentos futuros dos concluídos sem chamar Date no render.
  const [nowMs, setNowMs] = useState(0);
  const [returns, setReturns] = useState<ReturnClient[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    let active = true;
    fetchCommunicationData()
      .then((data) => {
        if (!active) return;
        setBusinessName(data.businessName);
        setAppointments(data.appointments);
        setReturns(data.returns);
        setProcedures(data.procedures);
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

  // Recarrega sob demanda (botão "Tentar novamente"). Chamado a partir de um
  // manipulador de evento, não do efeito, para respeitar as regras de hooks.
  async function retry() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCommunicationData();
      setBusinessName(data.businessName);
      setAppointments(data.appointments);
      setReturns(data.returns);
      setProcedures(data.procedures);
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
            Prepare confirmações, orientações pós-atendimento e contatos de
            retorno. Nenhuma mensagem é enviada automaticamente: você revisa o
            texto e abre o WhatsApp quando quiser.
          </p>
        </header>

        <div className="mb-6 rounded-2xl border border-[#e4ebe7] bg-white p-4 text-sm text-[#52635b]">
          <p>
            <span className="font-semibold text-[#30463c]">
              Como funciona:
            </span>{" "}
            escolha uma ação, revise a mensagem sugerida, copie se preferir e
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
                <p className="mt-4 rounded-xl bg-[#fafcfb] p-4 text-sm text-[#78867f]">
                  Nenhum agendamento futuro para confirmar no momento.
                </p>
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
                Atendimentos concluídos recentemente para acompanhar a cliente.
              </p>
              {completed.length === 0 ? (
                <p className="mt-4 rounded-xl bg-[#fafcfb] p-4 text-sm text-[#78867f]">
                  Nenhum atendimento concluído nos últimos 30 dias.
                </p>
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

            <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-[#30463c]">
                  Retorno de clientes
                </h2>
                <span className="rounded-full bg-[#f4efe6] px-2.5 py-1 text-xs font-semibold text-[#8a641d]">
                  Promocional
                </span>
              </div>
              <p className="mt-1 text-sm text-[#78867f]">
                Clientes que podem precisar de contato. Estas mensagens são
                promocionais: confirme que a cliente aceita receber o contato
                antes de enviar.
              </p>
              {returns.length === 0 ? (
                <p className="mt-4 rounded-xl bg-[#fafcfb] p-4 text-sm text-[#78867f]">
                  Nenhuma cliente para contato de retorno no momento.
                </p>
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
                marketing — a decisão de contatar é da profissional.
              </p>
            </section>

            <section
              id="protocolos"
              className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-[#30463c]">
                  Protocolos de Procedimentos
                </h2>
                <span className="rounded-full bg-[#edf3ef] px-2.5 py-1 text-xs font-semibold text-[#50655b]">
                  Documentos
                </span>
              </div>
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">
                  Envio e armazenamento de PDF ainda não disponível neste
                  ambiente.
                </p>
                <p className="mt-1">
                  Para cadastrar protocolos em PDF por procedimento, protegidos
                  por organização, é necessário um serviço de armazenamento
                  privado (bucket de objetos) com acesso autenticado e uma
                  tabela dedicada à associação protocolo ↔ procedimento. Nenhum
                  desses recursos está configurado, então esta versão não faz
                  upload de arquivos nem mantém documentos.
                </p>
              </div>
              <p className="mt-3 text-sm text-[#52635b]">
                Enquanto isso, você pode registrar as orientações gerais de
                cada {labels.singular.toLowerCase()} no campo Descrição, em{" "}
                <Link
                  href="/app/procedimentos"
                  className="font-semibold text-[#30463c] underline"
                >
                  {labels.plural}
                </Link>
                , e usar as mensagens pós-atendimento acima para falar com a
                cliente após o atendimento.
              </p>
              {procedures.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[#78867f]">
                    Procedimentos cadastrados
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {procedures.map((procedure) => (
                      <li
                        key={procedure.id}
                        className="rounded-full bg-[#edf3ef] px-3 py-1 text-xs font-medium text-[#50655b]"
                      >
                        {procedure.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
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
