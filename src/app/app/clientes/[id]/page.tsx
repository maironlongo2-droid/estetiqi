"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buildWhatsAppUrl } from "@/lib/clients/whatsapp";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  birth_date: string | null;
  notes: string | null;
  status: string;
  source: string | null;
  created_at: string;
};

type Profile = {
  client: Client;
  appointments: Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    price: number | string | null;
    notes: string | null;
    professional_name: string | null;
    procedure_name: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: number | string;
    payment_method: string | null;
    status: string;
    paid_at: string | null;
    notes: string | null;
    created_at: string;
    procedure_name: string | null;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    source: string;
    appointment_id: string | null;
    payment_id: string | null;
    data: Record<string, unknown> | null;
    created_at: string;
  }>;
  totals: {
    appointments_count: number;
    completed_count: number;
    total_paid: number | string;
    first_appointment_at: string | null;
    last_appointment_at: string | null;
    days_since_last_appointment: number | null;
    next_appointment_at: string | null;
    average_paid_ticket: number | string | null;
    paid_transactions_count: number;
    most_frequent_procedure: string | null;
    last_procedure: string | null;
    return_interval_days: number | null;
    return_due_at: string | null;
    days_until_return: number | null;
  };
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value: number | string | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function returnTiming(days: number) {
  if (days > 0) return `Retorno previsto em aproximadamente ${days} dias`;
  if (days < 0) return `Período de retorno previsto há ${Math.abs(days)} dias`;
  return "Período de retorno previsto para hoje";
}

function appointmentStatus(status: string) {
  const labels: Record<string, string> = {
    scheduled: "Agendado",
    confirmed: "Confirmado",
    completed: "Concluído",
    cancelled: "Cancelado",
    no_show: "Não compareceu",
  };

  return labels[status] ?? status;
}

function paymentStatus(status: string) {
  const labels: Record<string, string> = {
    paid: "Pago",
    pending: "Pendente",
    cancelled: "Cancelado",
    refunded: "Estornado",
  };

  return labels[status] ?? status;
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    "payment.paid": "Pagamento realizado",
    "payment.pending": "Pagamento pendente",
    "payment.cancelled": "Pagamento cancelado",
    "payment.refunded": "Pagamento estornado",
    "payment.updated": "Pagamento atualizado",
    "appointment.created": "Agendamento criado",
    "appointment.scheduled": "Agendamento registrado",
    "appointment.confirmed": "Agendamento confirmado",
    "appointment.completed": "Atendimento concluído",
    "appointment.cancelled": "Atendimento cancelado",
    "appointment.no_show": "Cliente não compareceu",
    "appointment.updated": "Atendimento atualizado",
  };

  // Tipos não reconhecidos (inclui eventos legados) recebem um rótulo genérico
  // para não expor códigos técnicos crus na ficha da cliente.
  return labels[type] ?? "Evento registrado";
}

function paymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    pix: "Pix",
    credito: "Crédito",
    debito: "Débito",
    dinheiro: "Dinheiro",
  };

  return labels[method] ?? method;
}

function eventSourceLabel(source: string) {
  // A origem padrão ("system") é técnica e não agrega valor para a profissional.
  if (!source || source === "system") return null;

  const labels: Record<string, string> = {
    user: "Equipe",
    import: "Importação",
    automation: "Automação",
    ai: "EstetiQI IA",
  };

  return labels[source] ?? source;
}

// Monta uma linha legível com os dados relevantes disponíveis no evento,
// correlacionando com os atendimentos e pagamentos já carregados na ficha.
function eventDetails(
  event: Profile["events"][number],
  appointmentsById: Map<string, Profile["appointments"][number]>,
  paymentsById: Map<string, Profile["payments"][number]>
) {
  const data = event.data ?? {};
  const details: string[] = [];

  const appointment = event.appointment_id
    ? appointmentsById.get(event.appointment_id)
    : undefined;
  const payment = event.payment_id
    ? paymentsById.get(event.payment_id)
    : undefined;

  const procedureName =
    appointment?.procedure_name ?? payment?.procedure_name ?? null;
  if (procedureName) details.push(procedureName);

  const professionalName =
    appointment?.professional_name ??
    (typeof data.professionalName === "string" ? data.professionalName : null);
  if (professionalName) details.push(professionalName);

  const previousStatus =
    typeof data.previousStatus === "string" ? data.previousStatus : null;
  const newStatus =
    typeof data.newStatus === "string" ? data.newStatus : null;
  if (previousStatus && newStatus) {
    const label = event.event_type.startsWith("payment.")
      ? paymentStatus
      : appointmentStatus;
    details.push(`${label(previousStatus)} → ${label(newStatus)}`);
  }

  if (typeof data.amount === "number") {
    details.push(formatMoney(data.amount));
  } else if (typeof data.price === "number") {
    details.push(formatMoney(data.price));
  }

  if (typeof data.paymentMethod === "string" && data.paymentMethod) {
    details.push(paymentMethodLabel(data.paymentMethod));
  }

  return details;
}

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(
          `/api/clients/${params.id}/profile`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || "Não foi possível carregar o cliente."
          );
        }

        setProfile(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar o cliente."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params.id]);

  if (loading) {
    return (
      <main className="app-min-h bg-[#fbfaf8] p-8">
        <p className="text-sm text-[#78867f]">
          Carregando ficha do cliente...
        </p>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="app-min-h bg-[#fbfaf8] p-8">
        <Link
          href="/app/clientes"
          className="text-sm text-[#50655b]"
        >
          ← Voltar para clientes
        </Link>

        <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error || "Cliente não encontrado."}
        </p>
      </main>
    );
  }

  const { client, appointments, payments, events, totals } = profile;
  const whatsappUrl = buildWhatsAppUrl({
    name: client.name,
    phone: client.phone,
    lastProcedureName: totals.last_procedure,
  });

  // Correlaciona os eventos com os atendimentos e pagamentos já carregados,
  // sem consultas extras, para enriquecer a linha do tempo.
  const appointmentsById = new Map(
    appointments.map((appointment) => [appointment.id, appointment])
  );
  const paymentsById = new Map(
    payments.map((payment) => [payment.id, payment])
  );

  return (
    <main className="app-min-h bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Link
          href="/app/clientes"
          className="text-sm text-[#66756d] hover:text-[#30463c]"
        >
          ← Clientes
        </Link>

        <section className="mt-5 rounded-2xl border border-[#e4ebe7] bg-white p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-[#30463c]">
                  {client.name}
                </h1>

                <span className="rounded-full bg-[#edf3ef] px-3 py-1 text-xs font-medium">
                  {client.status === "active" ? "Ativo" : "Inativo"}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-[#78867f]">
                <p>{client.phone || "Sem telefone"}</p>
                <p>{client.email || "Sem e-mail"}</p>
                {client.cpf && <p>CPF: {client.cpf}</p>}
                {client.birth_date && (
                  <p>
                    Nascimento: {formatDate(client.birth_date)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-[#527765] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#456957]"
                >
                  Enviar pelo WhatsApp
                </a>
              ) : (
                <span className="self-center text-sm text-[#8a9891]">
                  Cadastre um telefone válido para usar o WhatsApp.
                </span>
              )}
              <Link
                href={`/app/agenda?client=${client.id}`}
                className="rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white"
              >
                Novo agendamento
              </Link>
            </div>
          </div>

          {client.notes && (
            <div className="mt-5 rounded-xl bg-[#f6f8f7] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#8a9891]">
                Observações
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#50655b]">
                {client.notes}
              </p>
            </div>
          )}
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-xs text-[#8a9891]">
              Primeiro atendimento
            </p>
            <p className="mt-2 text-lg font-semibold text-[#30463c]">
              {formatDate(totals.first_appointment_at)}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-xs text-[#8a9891]">
              Último atendimento
            </p>
            <p className="mt-2 text-lg font-semibold text-[#30463c]">
              {formatDate(totals.last_appointment_at)}
            </p>
            {totals.days_since_last_appointment !== null && (
              <p className="mt-1 text-xs text-[#78867f]">
                {totals.days_since_last_appointment} dias atrás
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-xs text-[#8a9891]">Atendimentos concluídos</p>
            <p className="mt-2 text-2xl font-semibold text-[#30463c]">
              {totals.completed_count}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-xs text-[#8a9891]">Próximo atendimento</p>
            <p className="mt-2 text-lg font-semibold text-[#30463c]">
              {formatDate(totals.next_appointment_at)}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-xs text-[#8a9891]">
              Total pago
            </p>
            <p className="mt-2 text-2xl font-semibold text-[#30463c]">
              {formatMoney(totals.total_paid)}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-xs text-[#8a9891]">Ticket médio pago</p>
            <p className="mt-2 text-lg font-semibold text-[#30463c]">
              {totals.paid_transactions_count > 0
                ? formatMoney(totals.average_paid_ticket)
                : "Sem dados suficientes"}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-xs text-[#8a9891]">Procedimento mais frequente</p>
            <p className="mt-2 text-lg font-semibold text-[#30463c]">
              {totals.most_frequent_procedure || "Sem dados suficientes"}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-xs text-[#8a9891]">Último procedimento</p>
            <p className="mt-2 text-lg font-semibold text-[#30463c]">
              {totals.last_procedure || "Sem dados suficientes"}
            </p>
          </div>
        </section>

        {totals.return_interval_days &&
          totals.return_due_at &&
          totals.days_until_return !== null && (
          <section className="mt-4 rounded-2xl border border-[#dce8df] bg-[#f2f7f3] p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-[#6f927f]">
              Informações de retorno
            </p>
            <p className="mt-2 text-sm font-medium text-[#30463c]">
              {totals.last_procedure
                ? `${totals.last_procedure}: intervalo recomendado de ${totals.return_interval_days} dias.`
                : `Intervalo recomendado de ${totals.return_interval_days} dias.`}{" "}
              {returnTiming(totals.days_until_return)}.
            </p>
          </section>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#e4ebe7] bg-white">
            <div className="border-b border-[#e4ebe7] p-5">
              <h2 className="font-semibold text-[#30463c]">
                Histórico de agendamentos
              </h2>
            </div>

            {appointments.length === 0 ? (
              <p className="p-5 text-sm text-[#78867f]">
                Nenhum agendamento encontrado.
              </p>
            ) : (
              <div className="divide-y divide-[#e4ebe7]">
                {appointments.map((appointment) => (
                  <div key={appointment.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-[#30463c]">
                          {appointment.procedure_name ||
                            "Atendimento"}
                        </p>

                        <p className="mt-1 text-sm text-[#78867f]">
                          {formatDateTime(appointment.starts_at)}
                        </p>

                        {appointment.professional_name && (
                          <p className="mt-1 text-xs text-[#9aa59f]">
                            {appointment.professional_name}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="rounded-full bg-[#f1f5f2] px-3 py-1 text-xs">
                          {appointmentStatus(appointment.status)}
                        </span>

                        {appointment.price != null && (
                          <p className="mt-2 text-sm font-medium">
                            {formatMoney(appointment.price)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#e4ebe7] bg-white">
            <div className="border-b border-[#e4ebe7] p-5">
              <h2 className="font-semibold text-[#30463c]">
                Pagamentos
              </h2>
            </div>

            {payments.length === 0 ? (
              <p className="p-5 text-sm text-[#78867f]">
                Nenhum pagamento encontrado.
              </p>
            ) : (
              <div className="divide-y divide-[#e4ebe7]">
                {payments.map((payment) => (
                  <div key={payment.id} className="p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-[#30463c]">
                          {payment.procedure_name ||
                            "Pagamento"}
                        </p>

                        <p className="mt-1 text-xs text-[#78867f]">
                          {formatDateTime(payment.created_at)}
                        </p>

                        {payment.payment_method && (
                          <p className="mt-1 text-xs text-[#9aa59f]">
                            {paymentMethodLabel(payment.payment_method)}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="font-semibold text-[#30463c]">
                          {formatMoney(payment.amount)}
                        </p>

                        <span className="text-xs text-[#78867f]">
                          {paymentStatus(payment.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="mt-5 rounded-2xl border border-[#e4ebe7] bg-white">
          <div className="border-b border-[#e4ebe7] p-5">
            <h2 className="font-semibold text-[#30463c]">
              Linha do tempo
            </h2>
          </div>

          {events.length === 0 ? (
            <p className="p-5 text-sm text-[#78867f]">
              Nenhum evento registrado ainda.
            </p>
          ) : (
            <div className="divide-y divide-[#e4ebe7]">
              {events.map((event) => {
                const details = eventDetails(
                  event,
                  appointmentsById,
                  paymentsById
                );
                const sourceLabel = eventSourceLabel(event.source);

                return (
                  <div
                    key={event.id}
                    className="flex items-start justify-between gap-4 p-5"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#50655b]">
                        {eventLabel(event.event_type)}
                      </p>

                      {details.length > 0 && (
                        <p className="mt-1 text-xs text-[#78867f]">
                          {details.join(" · ")}
                        </p>
                      )}

                      {sourceLabel && (
                        <p className="mt-1 text-xs text-[#9aa59f]">
                          Origem: {sourceLabel}
                        </p>
                      )}
                    </div>

                    <time className="shrink-0 text-xs text-[#8a9891]">
                      {formatDateTime(event.created_at)}
                    </time>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
