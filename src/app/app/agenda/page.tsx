"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Client = {
  id: string;
  name: string;
};

type Procedure = {
  id: string;
  name: string;
  price: number | null;
  duration_minutes: number | null;
};

type Appointment = {
  id: string;
  client_id: string;
  procedure_id: string | null;
  professional_name: string | null;
  starts_at: string;
  ends_at: string;
  price: number | null;
  notes: string | null;
  status: string;
  client_name: string;
  procedure_name: string | null;
};

const statuses = [
  { value: "", label: "Todos" },
  { value: "scheduled", label: "Agendados" },
  { value: "confirmed", label: "Confirmados" },
  { value: "completed", label: "Concluídos" },
  { value: "cancelled", label: "Cancelados" },
  { value: "no_show", label: "Não compareceram" },
];

const paymentMethods = [
  { value: "pix", label: "Pix" },
  { value: "credito", label: "Crédito" },
  { value: "debito", label: "Débito" },
  { value: "dinheiro", label: "Dinheiro" },
];

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "—";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

function statusLabel(status: string) {
  return (
    statuses.find((item) => item.value === status)?.label ??
    status
  );
}

export default function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickClientSaving, setQuickClientSaving] = useState(false);
  const [quickClientError, setQuickClientError] = useState("");
  const [quickClientForm, setQuickClientForm] = useState({
    name: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paidAppointments, setPaidAppointments] = useState<string[]>([]);
  const [paymentAppointment, setPaymentAppointment] =
    useState<Appointment | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paymentMethod: "pix",
  });

  const [selectedDate, setSelectedDate] = useState(
    localDateString(new Date())
  );
  const [statusFilter, setStatusFilter] = useState("");

  const [form, setForm] = useState({
    clientId: "",
    procedureId: "",
    professionalName: "",
    startsAt: "",
    endsAt: "",
    price: "",
    notes: "",
  });

  const selectedDateLabel = useMemo(() => {
    return new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
      "pt-BR",
      {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }
    );
  }, [selectedDate]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const query = new URLSearchParams({
        date: selectedDate,
      });

      if (statusFilter) {
        query.set("status", statusFilter);
      }

      const [appointmentsResponse, clientsResponse, proceduresResponse] =
        await Promise.all([
          fetch(`/api/appointments?${query.toString()}`),
          fetch("/api/clients?limit=500"),
          fetch("/api/procedures?limit=500"),
        ]);

      const appointmentsData = await appointmentsResponse.json();
      const clientsData = await clientsResponse.json();
      const proceduresData = await proceduresResponse.json();

      if (!appointmentsResponse.ok) {
        throw new Error(
          appointmentsData.error ||
            "Não foi possível carregar a agenda."
        );
      }

      setAppointments(appointmentsData.appointments || []);
      setClients(clientsData.clients || []);
      setProcedures(proceduresData.procedures || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a agenda."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedDate, statusFilter]);

  function changeDate(days: number) {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    setSelectedDate(localDateString(date));
  }

  function handleProcedureChange(procedureId: string) {
    const procedure = procedures.find(
      (item) => item.id === procedureId
    );

    setForm((current) => ({
      ...current,
      procedureId,
      price:
        procedure?.price !== null &&
        procedure?.price !== undefined
          ? String(procedure.price)
          : current.price,
      endsAt:
        procedure?.duration_minutes && current.startsAt
          ? new Date(
              new Date(current.startsAt).getTime() +
                procedure.duration_minutes * 60000
            )
              .toISOString()
              .slice(0, 16)
          : current.endsAt,
    }));
  }

  function handleStartChange(value: string) {
    setForm((current) => {
      const procedure = procedures.find(
        (item) => item.id === current.procedureId
      );

      return {
        ...current,
        startsAt: value,
        endsAt:
          procedure?.duration_minutes && value
            ? new Date(
                new Date(value).getTime() +
                  procedure.duration_minutes * 60000
              )
                .toISOString()
                .slice(0, 16)
            : current.endsAt,
      };
    });
  }

  async function createQuickClient(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setQuickClientError("");
    setQuickClientSaving(true);

    try {
      const response = await fetch("/api/clients/quick", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(quickClientForm),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível cadastrar o cliente."
        );
      }

      setClients((current) => {
        const exists = current.some((client) => client.id === data.id);

        if (exists) {
          return current;
        }

        return [...current, data].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR")
        );
      });

      setForm((current) => ({
        ...current,
        clientId: data.id,
      }));

      setQuickClientForm({
        name: "",
        phone: "",
      });

      setShowQuickClient(false);
    } catch (err) {
      setQuickClientError(
        err instanceof Error
          ? err.message
          : "Não foi possível cadastrar o cliente."
      );
    } finally {
      setQuickClientSaving(false);
    }
  }

  async function createAppointment(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: form.clientId,
          procedureId: form.procedureId || undefined,
          professionalName: form.professionalName,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          price: form.price ? Number(form.price) : undefined,
          notes: form.notes,
          status: "scheduled",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível criar o agendamento."
        );
      }

      setForm({
        clientId: "",
        procedureId: "",
        professionalName: "",
        startsAt: "",
        endsAt: "",
        price: "",
        notes: "",
      });

      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar o agendamento."
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(
    appointment: Appointment,
    status: string
  ) {
    setError("");

    const response = await fetch(
      `/api/appointments/${appointment.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      setError(
        data.error || "Não foi possível atualizar o status."
      );
      return;
    }

    await loadData();
  }

  function openPayment(appointment: Appointment) {
    setPaymentError("");

    setPaymentForm({
      amount:
        appointment.price !== null
          ? String(appointment.price)
          : "",
      paymentMethod: "pix",
    });

    setPaymentAppointment(appointment);
  }

  async function registerPayment(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!paymentAppointment) return;

    setPaymentError("");
    setPaymentSaving(true);

    try {
      const amount = Number(paymentForm.amount);

      if (!amount || amount <= 0) {
        throw new Error("Informe um valor de pagamento válido.");
      }

      const response = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: paymentAppointment.client_id,
          appointmentId: paymentAppointment.id,
          procedureId: paymentAppointment.procedure_id || undefined,
          amount,
          paymentMethod: paymentForm.paymentMethod,
          status: "paid",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível registrar o pagamento."
        );
      }

      setPaidAppointments((current) =>
        current.includes(paymentAppointment.id)
          ? current
          : [...current, paymentAppointment.id]
      );

      setPaymentAppointment(null);
    } catch (err) {
      setPaymentError(
        err instanceof Error
          ? err.message
          : "Não foi possível registrar o pagamento."
      );
    } finally {
      setPaymentSaving(false);
    }
  }

  function openNewAppointment() {
    setError("");
    setShowForm(true);
  }

  return (
    <main className="min-h-screen bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#30463c]">
              Agenda
            </h1>
            <p className="mt-1 text-sm text-[#78867f]">
              Organize os atendimentos do negócio.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white"
          >
            {showForm ? "Fechar" : "Novo agendamento"}
          </button>
        </section>

        <section className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changeDate(-1)}
                className="rounded-lg border border-[#dce5e0] px-3 py-2 text-sm"
              >
                ←
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(event) =>
                  setSelectedDate(event.target.value)
                }
                className="rounded-lg border border-[#dce5e0] px-3 py-2 text-sm"
              />

              <button
                type="button"
                onClick={() => changeDate(1)}
                className="rounded-lg border border-[#dce5e0] px-3 py-2 text-sm"
              >
                →
              </button>

              <button
                type="button"
                onClick={() =>
                  setSelectedDate(localDateString(new Date()))
                }
                className="rounded-lg bg-[#edf3ef] px-3 py-2 text-sm font-medium text-[#30463c]"
              >
                Hoje
              </button>
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              className="rounded-lg border border-[#dce5e0] px-3 py-2 text-sm"
            >
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          <p className="mt-4 text-sm font-medium capitalize text-[#50655b]">
            {selectedDateLabel}
          </p>
        </section>

        {showForm && (
          <form
            onSubmit={createAppointment}
            className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white p-6"
          >
            <h2 className="font-semibold text-[#30463c]">
              Novo agendamento
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#50655b]">
                  Cliente
                </label>

                <select
                  required
                  value={form.clientId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      clientId: event.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-[#dce5e0] p-3"
                >
                  <option value="">Selecione o cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setShowQuickClient(!showQuickClient);
                    setQuickClientError("");
                  }}
                  className="mt-2 text-sm font-semibold text-[#30463c] hover:underline"
                >
                  {showQuickClient
                    ? "Fechar cadastro rápido"
                    : "+ Cadastrar novo cliente"}
                </button>

                {showQuickClient && (
                  <div className="mt-3 rounded-xl border border-[#e4ebe7] bg-[#f8faf9] p-4">
                    <p className="text-sm font-semibold text-[#30463c]">
                      Cadastro rápido
                    </p>

                    <div className="mt-3 grid gap-3">
                      <input
                        required
                        type="text"
                        placeholder="Nome do cliente"
                        value={quickClientForm.name}
                        onChange={(event) =>
                          setQuickClientForm({
                            ...quickClientForm,
                            name: event.target.value,
                          })
                        }
                        className="rounded-xl border border-[#dce5e0] bg-white p-3 text-sm"
                      />

                      <input
                        type="text"
                        placeholder="Telefone"
                        value={quickClientForm.phone}
                        onChange={(event) =>
                          setQuickClientForm({
                            ...quickClientForm,
                            phone: event.target.value,
                          })
                        }
                        className="rounded-xl border border-[#dce5e0] bg-white p-3 text-sm"
                      />

                      {quickClientError && (
                        <p className="text-sm text-red-600">
                          {quickClientError}
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={
                          quickClientSaving ||
                          quickClientForm.name.trim().length < 2
                        }
                        onClick={() => {
                          const formElement =
                            document.getElementById(
                              "quick-client-form"
                            ) as HTMLFormElement | null;

                          formElement?.requestSubmit();
                        }}
                        className="rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {quickClientSaving
                          ? "Cadastrando..."
                          : "Cadastrar cliente"}
                      </button>

                      <form
                        id="quick-client-form"
                        onSubmit={createQuickClient}
                        className="hidden"
                      >
                        <button type="submit">Cadastrar</button>
                      </form>
                    </div>
                  </div>
                )}
              </div>

              <select
                value={form.procedureId}
                onChange={(event) =>
                  handleProcedureChange(event.target.value)
                }
                className="rounded-xl border border-[#dce5e0] p-3"
              >
                <option value="">Selecione o procedimento</option>
                {procedures.map((procedure) => (
                  <option key={procedure.id} value={procedure.id}>
                    {procedure.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Profissional"
                value={form.professionalName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    professionalName: event.target.value,
                  })
                }
                className="rounded-xl border border-[#dce5e0] p-3"
              />

              <input
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  handleStartChange(event.target.value)
                }
                className="rounded-xl border border-[#dce5e0] p-3"
              />

              <input
                required
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) =>
                  setForm({
                    ...form,
                    endsAt: event.target.value,
                  })
                }
                className="rounded-xl border border-[#dce5e0] p-3"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Preço"
                value={form.price}
                onChange={(event) =>
                  setForm({
                    ...form,
                    price: event.target.value,
                  })
                }
                className="rounded-xl border border-[#dce5e0] p-3"
              />

              <textarea
                placeholder="Observações"
                value={form.notes}
                onChange={(event) =>
                  setForm({
                    ...form,
                    notes: event.target.value,
                  })
                }
                className="rounded-xl border border-[#dce5e0] p-3 md:col-span-2"
                rows={3}
              />
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-5 rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar agendamento"}
            </button>
          </form>
        )}

        {error && !showForm && (
          <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white">
          <div className="flex items-center justify-between border-b border-[#e4ebe7] p-6">
            <div>
              <h2 className="font-semibold text-[#30463c]">
                Atendimentos do dia
              </h2>
              <p className="mt-1 text-xs text-[#8a9891]">
                {appointments.length} atendimento(s)
              </p>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <p className="text-sm text-[#78867f]">
                Carregando agenda...
              </p>
            ) : appointments.length === 0 ? (
              <div className="py-10 text-center">
                <p className="font-medium text-[#50655b]">
                  Nenhum atendimento para este dia.
                </p>

                <button
                  type="button"
                  onClick={openNewAppointment}
                  className="mt-3 text-sm font-medium text-[#6f927f]"
                >
                  Criar agendamento
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {appointments.map((appointment) => {
                  const isPaid = paidAppointments.includes(
                    appointment.id
                  );

                  return (
                    <div
                      key={appointment.id}
                      className="rounded-xl border border-[#e4ebe7] p-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex gap-4">
                          <div className="min-w-16">
                            <p className="font-semibold text-[#30463c]">
                              {formatTime(appointment.starts_at)}
                            </p>
                            <p className="text-xs text-[#9aa59f]">
                              {formatTime(appointment.ends_at)}
                            </p>
                          </div>

                          <div>
                            <Link
                              href={`/app/clientes/${appointment.client_id}`}
                              className="font-semibold hover:text-[#6f927f]"
                            >
                              {appointment.client_name}
                            </Link>

                            <p className="mt-1 text-sm text-[#78867f]">
                              {appointment.procedure_name ||
                                "Procedimento não informado"}
                            </p>

                            {appointment.professional_name && (
                              <p className="mt-1 text-xs text-[#9aa59f]">
                                {appointment.professional_name}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-start gap-2 md:items-end">
                          <p className="font-medium text-[#30463c]">
                            {formatMoney(appointment.price)}
                          </p>

                          <select
                            value={appointment.status}
                            onChange={(event) =>
                              updateStatus(
                                appointment,
                                event.target.value
                              )
                            }
                            className="rounded-lg border border-[#dce5e0] px-3 py-2 text-xs"
                          >
                            {statuses
                              .filter((item) => item.value)
                              .map((status) => (
                                <option
                                  key={status.value}
                                  value={status.value}
                                >
                                  {status.label}
                                </option>
                              ))}
                          </select>

                          <span className="text-xs text-[#9aa59f]">
                            {statusLabel(appointment.status)}
                          </span>

                          {isPaid ? (
                            <span className="rounded-lg bg-[#edf7ef] px-3 py-2 text-xs font-medium text-[#477152]">
                              Pagamento registrado
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                openPayment(appointment)
                              }
                              disabled={appointment.price === null}
                              className="rounded-lg bg-[#30463c] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Registrar pagamento
                            </button>
                          )}
                        </div>
                      </div>

                      {appointment.notes && (
                        <p className="mt-3 border-t border-[#eef2ef] pt-3 text-xs text-[#78867f]">
                          {appointment.notes}
                        </p>
                      )}

                      <p className="mt-2 text-xs text-[#a0aaa5]">
                        {formatDate(appointment.starts_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {paymentAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={registerPayment}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#30463c]">
                  Registrar pagamento
                </h2>
                <p className="mt-1 text-sm text-[#78867f]">
                  {paymentAppointment.client_name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPaymentAppointment(null)}
                className="text-xl text-[#78867f]"
              >
                ×
              </button>
            </div>

            <div className="mt-5">
              <label className="text-sm font-medium text-[#50655b]">
                Valor
              </label>

              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={paymentForm.amount}
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    amount: event.target.value,
                  })
                }
                className="mt-2 w-full rounded-xl border border-[#dce5e0] p-3"
              />
            </div>

            <div className="mt-5">
              <p className="text-sm font-medium text-[#50655b]">
                Forma de pagamento
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {paymentMethods.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() =>
                      setPaymentForm({
                        ...paymentForm,
                        paymentMethod: method.value,
                      })
                    }
                    className={`rounded-xl border px-3 py-3 text-sm font-medium ${
                      paymentForm.paymentMethod === method.value
                        ? "border-[#30463c] bg-[#edf3ef] text-[#30463c]"
                        : "border-[#dce5e0] text-[#50655b]"
                    }`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>

            {paymentError && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {paymentError}
              </p>
            )}

            <button
              type="submit"
              disabled={paymentSaving}
              className="mt-5 w-full rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {paymentSaving
                ? "Registrando..."
                : "Confirmar pagamento"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
