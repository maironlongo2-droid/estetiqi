"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useToast } from "../toast";
import { useProcedureLabels } from "../procedure-labels";

// Rascunho do formulário de novo agendamento (apenas nesta sessão do navegador).
// v3: a v2 podia guardar um preço total somado como texto (bug corrigido);
// descartar evita reaproveitar um valor inválido ao reabrir a agenda.
const appointmentDraftPrefix = "estetiqi:agenda:draft:v3";

type AppointmentDraft = {
  clientId: string;
  procedureIds: string[];
  professionalId: string;
  startsAt: string;
  endsAt: string;
  price: string;
  notes: string;
  appointmentDate: string;
};

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

type Professional = {
  id: string;
  name: string;
  active: boolean;
  procedure_ids: string[];
};

type Appointment = {
  id: string;
  client_id: string;
  procedure_id: string | null;
  professional_id: string | null;
  professional_name: string | null;
  starts_at: string;
  ends_at: string;
  price: number | null;
  notes: string | null;
  status: string;
  client_name: string;
  procedure_name: string | null;
  procedures?: {
    id: string;
    name: string | null;
    price: number | null;
    durationMinutes: number | null;
  }[];
  has_payments?: boolean;
};

// Dados necessários para abrir/preencher o formulário de novo agendamento.
type FormSupport = {
  clients: Client[];
  procedures: Procedure[];
  professionals: Professional[];
};

type AvailableSlot = {
  startsAt: string;
  endsAt: string;
};

// Listagem da agenda: busca somente os atendimentos das datas consultadas.
async function fetchAgendaAppointments(
  selectedDate: string,
  statusFilter: string,
  professionalFilter: string,
  upcoming = false
): Promise<Appointment[]> {
  const query = new URLSearchParams();
  if (statusFilter) query.set("status", statusFilter);
  if (professionalFilter) query.set("professionalId", professionalFilter);
  // Visão "Próximos": uma única consulta cobrindo selectedDate..selectedDate+13,
  // equivalente à união das 14 consultas diárias anteriores.
  // Visão "Dia": mantém a consulta única por data (comportamento original).
  if (upcoming) {
    const lastDate = new Date(`${selectedDate}T12:00:00-03:00`);
    lastDate.setDate(lastDate.getDate() + 13);
    query.set("from", selectedDate);
    query.set("to", brasilDateString(lastDate));
  } else {
    query.set("date", selectedDate);
  }

  const response = await fetch(`/api/appointments?${query.toString()}`);
  const appointmentsData: { appointments?: Appointment[]; error?: string } =
    await response.json();

  if (!response.ok) {
    throw new Error(
      appointmentsData.error || "Não foi possível carregar a agenda."
    );
  }

  return (appointmentsData.appointments || [])
    .map(
      (
        appointment: Omit<Appointment, "price"> & {
          price: number | string | null;
        }
      ) => ({
        ...appointment,
        price: appointment.price === null ? null : Number(appointment.price),
      })
    )
    .filter(
      (appointment) =>
        !upcoming ||
        (new Date(appointment.starts_at).getTime() >= Date.now() &&
          (statusFilter !== "" ||
            !["cancelled", "no_show"].includes(appointment.status)))
    );
}

// Dados do formulário (clientes, procedimentos, profissionais). Não dependem
// do carregamento da agenda e podem carregar em paralelo.
async function fetchFormSupportData(): Promise<FormSupport> {
  const [clientsResponse, proceduresResponse, professionalsResponse] =
    await Promise.all([
      fetch("/api/clients?status=active&limit=500&sort=created_at&order=desc"),
      fetch("/api/procedures?status=active&limit=500"),
      fetch("/api/professionals"),
    ]);
  const [clientsData, proceduresData, professionalsData] = await Promise.all([
    clientsResponse.json(),
    proceduresResponse.json(),
    professionalsResponse.json(),
  ]);

  if (!clientsResponse.ok) {
    throw new Error(
      clientsData.error || "Não foi possível carregar clientes."
    );
  }

  if (!proceduresResponse.ok) {
    throw new Error(
      proceduresData.error || "Não foi possível carregar procedimentos."
    );
  }

  if (!professionalsResponse.ok) {
    throw new Error(
      professionalsData.error || "Não foi possível carregar profissionais."
    );
  }

  // O driver do Postgres entrega NUMERIC como string ("60.00"). O formulário
  // soma os preços, então normaliza para número; do contrário a soma vira
  // concatenação de texto ("060.00100.00" -> NaN) e o total exibido/enviado
  // quebra com mais de um procedimento.
  const procedures: Procedure[] = (
    (proceduresData.procedures || []) as Array<
      Omit<Procedure, "price"> & { price: number | string | null }
    >
  ).map((procedure) => ({
    ...procedure,
    price:
      procedure.price === null || procedure.price === undefined
        ? null
        : Number(procedure.price),
  }));

  return {
    clients: clientsData.clients || [],
    procedures,
    professionals: professionalsData || [],
  };
}

// Pagamentos são secundários: não devem bloquear a agenda nem o formulário.
async function fetchPaidAppointmentIds(): Promise<string[]> {
  const response = await fetch("/api/payments");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Não foi possível carregar pagamentos.");
  }

  return Array.from(
    new Set(
      (Array.isArray(data) ? data : [])
        .filter((payment: { status?: string }) => payment?.status === "paid")
        .map(
          (payment: { appointment_id?: string | null }) =>
            payment?.appointment_id
        )
        .filter((id: string | null | undefined): id is string => Boolean(id))
    )
  );
}

const statuses = [
  { value: "", label: "Todos" },
  { value: "scheduled", label: "Agendados" },
  { value: "confirmed", label: "Confirmados" },
  { value: "completed", label: "Concluídos" },
  { value: "cancelled", label: "Cancelados" },
  { value: "no_show", label: "Não compareceram" },
];

const appointmentStatusLabels: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const paymentMethods = [
  { value: "pix", label: "Pix" },
  { value: "credito", label: "Crédito" },
  { value: "debito", label: "Débito" },
  { value: "dinheiro", label: "Dinheiro" },
];

function brasilDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function appointmentDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function appointmentDurationMinutes(appointment: Appointment) {
  return Math.round(
    (new Date(appointment.ends_at).getTime() -
      new Date(appointment.starts_at).getTime()) /
      60_000
  );
}

function upcomingDateLabel(date: string, today: string) {
  const daysFromToday = Math.round(
    (new Date(`${date}T12:00:00-03:00`).getTime() -
      new Date(`${today}T12:00:00-03:00`).getTime()) /
      86_400_000
  );
  if (daysFromToday === 0) return "Hoje";
  if (daysFromToday === 1) return "Amanhã";
  return new Date(`${date}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function formatSlot(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function formatBrazilDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function brazilDateTimeToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "—";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

function statusLabel(status: string) {
  return appointmentStatusLabels[status] ?? status;
}

function appointmentProcedureLabel(appointment: Appointment, fallback: string) {
  const names = (appointment.procedures ?? [])
    .map((procedure) => procedure.name)
    .filter((name): name is string => Boolean(name));
  if (names.length) return names.join(" + ");
  return appointment.procedure_name || fallback;
}

function availableStatusChanges(appointment: Appointment) {
  const changes: Array<{ value: string; label: string }> = [];
  const ended = new Date(appointment.ends_at).getTime() <= Date.now();

  if (appointment.status === "scheduled") {
    changes.push({ value: "confirmed", label: "Confirmar atendimento" });
  }
  if (ended && ["scheduled", "confirmed"].includes(appointment.status)) {
    changes.push(
      { value: "completed", label: "Marcar como concluído" },
      { value: "no_show", label: "Marcar como não compareceu" }
    );
  }

  return changes;
}

function primaryAppointmentAction(appointment: Appointment, isPaid: boolean) {
  const ended = new Date(appointment.ends_at).getTime() <= Date.now();
  if (ended && ["scheduled", "confirmed"].includes(appointment.status)) {
    return {
      kind: "status" as const,
      value: "completed",
      label: "Marcar como concluído",
    };
  }
  if (appointment.status === "scheduled") {
    return {
      kind: "status" as const,
      value: "confirmed",
      label: "Confirmar atendimento",
    };
  }
  if (appointment.status === "confirmed" && !isPaid) {
    return {
      kind: "payment" as const,
      label: "Registrar pagamento",
    };
  }
  if (appointment.status === "completed" && !isPaid) {
    return {
      kind: "payment" as const,
      label: "Registrar pagamento",
    };
  }
  return null;
}

type ProcedureOption = { id: string; name: string };

// Campos de procedimentos do agendamento: múltiplas linhas, com botão de
// adicionar e remover. As opções de cada linha excluem procedimentos já
// escolhidos em outras linhas (não permite repetir o mesmo procedimento).
function ProcedureFields({
  ids,
  optionsForIndex,
  onChange,
  onAdd,
  onRemove,
}: {
  ids: string[];
  optionsForIndex: (index: number) => ProcedureOption[];
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const labels = useProcedureLabels();
  return (
    <div className="block text-sm font-medium text-[#50655b]">
      <span>{labels.plural}</span>
      <div className="mt-2 space-y-2">
        {ids.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <select
              aria-label={index === 0 ? labels.singular : `${labels.singular} ${index + 1}`}
              data-testid={index === 0 ? "agenda-procedure-select" : undefined}
              value={value}
              onChange={(event) => onChange(index, event.target.value)}
              className="w-full rounded-xl border border-[#dce5e0] bg-white p-3"
            >
              <option value="">Selecione o {labels.singularLower}</option>
              {optionsForIndex(index).map((procedure) => (
                <option key={procedure.id} value={procedure.id}>
                  {procedure.name}
                </option>
              ))}
            </select>
            {ids.length > 1 && (
              <button
                type="button"
                aria-label={`Remover ${labels.singularLower} ${index + 1}`}
                onClick={() => onRemove(index)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#dce5e0] text-lg text-[#8a5149] hover:bg-[#fdf5f4]"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 text-sm font-medium text-[#6f927f] hover:text-[#30463c]"
      >
        + Adicionar {labels.singularLower}
      </button>
    </div>
  );
}

// Resumo do atendimento exibido antes de confirmar: valor individual de cada
// procedimento e a soma total (a duração total é preservada).
function AppointmentTotalsSummary({
  procedures,
  durationMinutes,
  total,
  hasAnyPrice,
  colSpanClassName,
}: {
  procedures: { id: string; name: string; price: number | null }[];
  durationMinutes: number;
  total: number;
  hasAnyPrice: boolean;
  colSpanClassName: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[#e4ebe7] bg-[#f7faf8] p-3 text-sm ${colSpanClassName}`}
    >
      <p className="font-medium text-[#30463c]">Resumo do atendimento</p>
      {procedures.length > 0 && (
        <ul className="mt-1 space-y-1 text-[#50655b]">
          {procedures.map((procedure) => (
            <li
              key={procedure.id}
              className="flex items-center justify-between gap-3"
            >
              <span>{procedure.name}</span>
              <span className="tabular-nums">
                {procedure.price === null
                  ? "Sem preço"
                  : formatMoney(procedure.price)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[#50655b]">
        {durationMinutes > 0 && <>Duração total: {durationMinutes} min</>}
        {durationMinutes > 0 && hasAnyPrice && " · "}
        {hasAnyPrice && <>Total: {formatMoney(total)}</>}
      </p>
    </div>
  );
}

export default function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [loading, setLoading] = useState(true);
  const [formDataLoading, setFormDataLoading] = useState(true);
  const [formSupportError, setFormSupportError] = useState("");
  const [formSupportAttempt, setFormSupportAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { notifyError } = useToast();
  const labels = useProcedureLabels();
  const { user, isLoaded } = useUser();
  const draftKey = `${appointmentDraftPrefix}:${user?.id ?? "anon"}`;
  const draftHydrated = useRef(false);
  const [error, setError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paidAppointments, setPaidAppointments] = useState<string[]>([]);
  const [paymentAppointment, setPaymentAppointment] =
    useState<Appointment | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState<{
    methods: { id?: string; paymentMethod: string; amount: string }[];
  }>({
    methods: [{ paymentMethod: "pix", amount: "" }],
  });
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [editForm, setEditForm] = useState({
    clientId: "",
    professionalId: "",
    procedureIds: [""],
    date: "",
    endsDate: "",
    startsAt: "",
    endsAt: "",
    price: "",
    notes: "",
    status: "scheduled",
  });
  const [editSaving, setEditSaving] = useState(false);

  const [selectedDate, setSelectedDate] = useState(
    brasilDateString(new Date())
  );
  const [upcomingView, setUpcomingView] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  // Filtro por profissional (identificador). "" significa todas as profissionais.
  const [professionalFilter, setProfessionalFilter] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(
    brasilDateString(new Date())
  );

  const [form, setForm] = useState({
    clientId: "",
    procedureIds: [""],
    professionalId: "",
    startsAt: "",
    endsAt: "",
    price: "",
    notes: "",
  });

  const selectedDateLabel = useMemo(() => {
    return new Date(`${selectedDate}T12:00:00-03:00`).toLocaleDateString(
      "pt-BR",
      {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }
    );
  }, [selectedDate]);
  const upcomingGroups = useMemo(() => {
    const today = brasilDateString(new Date());
    const groups = new Map<string, Appointment[]>();
    for (const appointment of appointments) {
      const date = appointmentDateKey(appointment.starts_at);
      const group = groups.get(date) ?? [];
      group.push(appointment);
      groups.set(date, group);
    }
    return Array.from(groups, ([date, items]) => ({
      date,
      label: upcomingDateLabel(date, today),
      appointments: items.sort(
        (left, right) =>
          new Date(left.starts_at).getTime() -
          new Date(right.starts_at).getTime()
      ),
    })).sort((left, right) => left.date.localeCompare(right.date));
  }, [appointments]);
  const selectedProfessional = useMemo(
    () =>
      professionals.find((item) => item.id === form.professionalId) ?? null,
    [professionals, form.professionalId]
  );
  const availableProcedures = useMemo(
    () =>
      procedures.filter(
        (procedure) =>
          !selectedProfessional ||
          selectedProfessional.procedure_ids.includes(procedure.id)
      ),
    [procedures, selectedProfessional]
  );

  // Procedimentos escolhidos no formulário de novo agendamento.
  const selectedProcedureIds = useMemo(
    () => form.procedureIds.filter(Boolean),
    [form.procedureIds]
  );
  const selectedProcedureIdsKey = selectedProcedureIds.join(",");

  const selectedProcedures = useMemo(
    () =>
      selectedProcedureIds
        .map((id) => procedures.find((procedure) => procedure.id === id))
        .filter((procedure): procedure is Procedure => Boolean(procedure)),
    [procedures, selectedProcedureIds]
  );

  // Totais exibidos ao usuário (duração e preço). O servidor recalcula com os
  // dados do banco.
  const formTotals = useMemo(() => {
    const durationMinutes = selectedProcedures.reduce(
      (total, procedure) => total + (procedure.duration_minutes ?? 0),
      0
    );
    const price = selectedProcedures.reduce(
      (total, procedure) => total + (procedure.price ?? 0),
      0
    );
    const hasAnyPrice = selectedProcedures.some(
      (procedure) => procedure.price !== null
    );
    return { durationMinutes, price, hasAnyPrice, procedures: selectedProcedures };
  }, [selectedProcedures]);

  // Totais do formulário de edição (duração e preço dos procedimentos atuais).
  const editTotals = useMemo(() => {
    const selected = editForm.procedureIds
      .filter(Boolean)
      .map((id) => {
        const inList = procedures.find((procedure) => procedure.id === id);
        if (inList) return inList;
        const current = editingAppointment?.procedures?.find(
          (procedure) => procedure.id === id
        );
        return current
          ? {
              id: current.id,
              name: current.name ?? "",
              price: current.price,
              duration_minutes: current.durationMinutes,
            }
          : null;
      })
      .filter((procedure): procedure is Procedure => Boolean(procedure));

    const durationMinutes = selected.reduce(
      (total, procedure) => total + (procedure.duration_minutes ?? 0),
      0
    );
    const price = selected.reduce(
      (total, procedure) => total + (procedure.price ?? 0),
      0
    );
    const hasAnyPrice = selected.some((procedure) => procedure.price !== null);
    return { durationMinutes, price, hasAnyPrice, procedures: selected };
  }, [editForm.procedureIds, procedures, editingAppointment]);

  function procedureOptionsForCreate(index: number) {
    const taken = new Set(
      form.procedureIds.filter((id, position) => id && position !== index)
    );
    return availableProcedures.filter((procedure) => !taken.has(procedure.id));
  }

  function procedureOptionsForEdit(index: number) {
    const taken = new Set(
      editForm.procedureIds.filter(
        (id, position) => id && position !== index
      )
    );
    const options: ProcedureOption[] = procedures
      .filter((procedure) => !taken.has(procedure.id))
      .map((procedure) => ({ id: procedure.id, name: procedure.name }));

    // Mantém os procedimentos atuais que já não estão na lista ativa.
    for (const id of editForm.procedureIds) {
      if (!id || taken.has(id)) continue;
      if (options.some((option) => option.id === id)) continue;
      const current = editingAppointment?.procedures?.find(
        (procedure) => procedure.id === id
      );
      if (current) {
        options.unshift({
          id: current.id,
          name: current.name ?? `${labels.singular} atual`,
        });
      }
    }

    return options;
  }

  function recomputeFormPrice(nextIds: string[]) {
    const total = nextIds
      .filter(Boolean)
      .map((id) => procedures.find((procedure) => procedure.id === id))
      .filter((procedure): procedure is Procedure => Boolean(procedure))
      .reduce((sum, procedure) => sum + (procedure.price ?? 0), 0);
    return total;
  }

  async function loadData(date = selectedDate, showUpcoming = upcomingView) {
    await Promise.all([
      fetchAgendaAppointments(date, statusFilter, professionalFilter, showUpcoming)
        .then((list) => {
          setError("");
          setAppointments(list);
        })
        .catch((err: unknown) => {
          notifyError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar a agenda."
          );
        }),
      fetchPaidAppointmentIds()
        .then((ids) => setPaidAppointments(ids))
        .catch((err: unknown) => {
          notifyError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar pagamentos."
          );
        }),
    ]);
  }

  // Listagem da agenda: carrega somente os atendimentos da data/período.
  useEffect(() => {
    let active = true;
    void fetchAgendaAppointments(
      selectedDate,
      statusFilter,
      professionalFilter,
      upcomingView
    )
      .then((list) => {
        if (!active) return;
        setError("");
        setAppointments(list);
      })
      .catch((err: unknown) => {
        if (active) {
          notifyError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar a agenda."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedDate, statusFilter, professionalFilter, upcomingView, notifyError]);

  // Dados do formulário (clientes, procedimentos, profissionais): carregam em
  // paralelo com a agenda e liberam o botão "Novo agendamento" sem esperar a
  // listagem completa nem os pagamentos.
  useEffect(() => {
    if (!isLoaded || !user) return;
    let active = true;
    void fetchFormSupportData()
      .then((support) => {
        if (!active) return;
        setClients(support.clients);
        setProcedures(support.procedures);
        setProfessionals(support.professionals);
        setFormSupportError("");
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message =
          err instanceof Error
            ? err.message
            : "Não foi possível carregar dados do agendamento.";
        setFormSupportError(message);
        notifyError(message);
      })
      .finally(() => {
        if (active) setFormDataLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isLoaded, user, notifyError, formSupportAttempt]);

  // Reexecuta o carregamento dos dados do formulário quando uma das APIs falha,
  // reutilizando o estado de carregamento existente.
  function retryFormSupportData() {
    setFormDataLoading(true);
    setFormSupportError("");
    setFormSupportAttempt((current) => current + 1);
  }

  // Pagamentos: carregam sem bloquear a agenda nem a preparação do formulário.
  useEffect(() => {
    if (!isLoaded || !user) return;
    let active = true;
    void fetchPaidAppointmentIds()
      .then((ids) => {
        if (active) setPaidAppointments(ids);
      })
      .catch((err: unknown) => {
        if (active) {
          notifyError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar pagamentos."
          );
        }
      });
    return () => {
      active = false;
    };
  }, [isLoaded, user, notifyError]);

  useEffect(() => {
    const procedureIds = selectedProcedureIdsKey
      ? selectedProcedureIdsKey.split(",")
      : [];
    if (
      !showForm ||
      !form.professionalId ||
      procedureIds.length === 0 ||
      !appointmentDate
    ) {
      return;
    }

    let active = true;
    const query = new URLSearchParams({
      professionalId: form.professionalId,
      procedureIds: procedureIds.join(","),
      date: appointmentDate,
    });

    fetch(`/api/appointments/availability?${query.toString()}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.error === "PROCEDURE_DURATION_REQUIRED"
              ? `Defina a duração do ${labels.singularLower} para consultar horários.`
              : data.error === "PROCEDURE_NOT_ASSIGNED"
                ? `Este profissional não realiza o ${labels.singularLower} selecionado.`
                : data.error || "Não foi possível consultar horários."
          );
        }
        return data.slots as AvailableSlot[];
      })
      .then((slots) => {
        if (!active) return;
        setAvailableSlots(slots);
        setForm((current) => {
          const currentStart = slots.find(
            (slot) => new Date(slot.startsAt).toISOString() ===
              (current.startsAt ? new Date(current.startsAt).toISOString() : "")
          );
          return currentStart
            ? { ...current, endsAt: new Date(currentStart.endsAt).toISOString() }
            : { ...current, startsAt: "", endsAt: "" };
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setAvailableSlots([]);
        setAvailabilityError(
          err instanceof Error
            ? err.message
            : "Não foi possível consultar horários."
        );
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    appointmentDate,
    form.professionalId,
    labels.singularLower,
    selectedProcedureIdsKey,
    showForm,
  ]);

  // Recupera o rascunho ao reabrir a Agenda na mesma sessão do navegador.
  useEffect(() => {
    if (!isLoaded || !user || draftHydrated.current) return;
    draftHydrated.current = true;

    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(draftKey);
    } catch {
      return;
    }
    if (!raw) return;

    let parsed: Partial<AppointmentDraft> | null = null;
    try {
      parsed = JSON.parse(raw) as Partial<AppointmentDraft>;
    } catch {
      window.sessionStorage.removeItem(draftKey);
    }
    if (!parsed) return;
    const draft = parsed;

    const legacyDraft = parsed as Partial<AppointmentDraft> & {
      procedureId?: string;
    };
    const draftProcedureIds = Array.isArray(draft.procedureIds)
      ? draft.procedureIds
      : legacyDraft.procedureId
        ? [legacyDraft.procedureId]
        : [];
    const nextForm = {
      clientId: draft.clientId ?? "",
      procedureIds: draftProcedureIds.length ? draftProcedureIds : [""],
      professionalId: draft.professionalId ?? "",
      startsAt: draft.startsAt ?? "",
      endsAt: draft.endsAt ?? "",
      price: draft.price ?? "",
      notes: draft.notes ?? "",
    };
    const hasContent = Object.values(nextForm).some((value) => value !== "");
    if (!hasContent) return;

    // Aplica o rascunho de forma assíncrona para não disparar render em cascata.
    void Promise.resolve().then(() => {
      setForm(nextForm);
      if (draft.appointmentDate) setAppointmentDate(draft.appointmentDate);
      setShowForm(true);
    });
  }, [draftKey, isLoaded, user]);

  // Mantém o rascunho atualizado enquanto o formulário tem conteúdo.
  useEffect(() => {
    if (!isLoaded || !user) return;
    const hasContent =
      form.clientId !== "" ||
      form.professionalId !== "" ||
      form.procedureIds.some((id) => id !== "") ||
      form.startsAt !== "" ||
      form.endsAt !== "" ||
      form.price !== "" ||
      form.notes !== "";
    if (!hasContent) return;
    try {
      const draft: AppointmentDraft = { ...form, appointmentDate };
      window.sessionStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Armazenamento indisponível (ex.: modo privado): o rascunho é ignorado.
    }
  }, [draftKey, isLoaded, user, form, appointmentDate]);

  function clearAppointmentDraft() {
    try {
      window.sessionStorage.removeItem(draftKey);
    } catch {
      // Armazenamento indisponível: nada a limpar.
    }
  }

  function changeDate(days: number) {
    const date = new Date(`${selectedDate}T12:00:00-03:00`);
    date.setDate(date.getDate() + days);
    setUpcomingView(false);
    setSelectedDate(brasilDateString(date));
  }

  function applyProcedureIds(
    nextIds: string[],
    nextProfessionalId: string
  ) {
    const hasAnyPrice = nextIds.some((id) => {
      const procedure = procedures.find((item) => item.id === id);
      return procedure?.price !== null && procedure?.price !== undefined;
    });

    setForm((current) => ({
      ...current,
      procedureIds: nextIds,
      startsAt: "",
      endsAt: "",
      // O preço exibido/enviado precisa acompanhar a seleção atual: quando
      // nenhum procedimento tem preço cadastrado, o campo fica livre para a
      // profissional informar o valor do atendimento.
      price: hasAnyPrice ? String(recomputeFormPrice(nextIds)) : "",
    }));
    setAvailableSlots([]);
    setAvailabilityError("");
    setAvailabilityLoading(Boolean(nextProfessionalId && nextIds.some((id) => id)));
  }

  function handleProcedureChange(
    index: number,
    procedureId: string,
    nextProfessionalId = form.professionalId
  ) {
    const nextIds = [...form.procedureIds];
    nextIds[index] = procedureId;
    applyProcedureIds(nextIds, nextProfessionalId);
  }

  function addProcedureRow() {
    applyProcedureIds([...form.procedureIds, ""], form.professionalId);
  }

  function removeProcedureAt(index: number) {
    const nextIds = form.procedureIds.filter(
      (_, position) => position !== index
    );
    applyProcedureIds(nextIds.length ? nextIds : [""], form.professionalId);
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
          procedureIds: selectedProcedureIds,
          professionalId: form.professionalId || undefined,
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

      const appointmentListDate =
        form.professionalId && selectedProcedureIds.length > 0
          ? appointmentDate
          : brasilDateString(new Date(form.startsAt));
      setForm({
        clientId: "",
        procedureIds: [""],
        professionalId: "",
        startsAt: "",
        endsAt: "",
        price: "",
        notes: "",
      });
      clearAppointmentDraft();
      setSelectedDate(appointmentListDate);
      setUpcomingView(false);
      setAppointmentDate(appointmentListDate);
      setShowForm(false);
      await loadData(appointmentListDate, false);
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

  function openAppointmentEditor(appointment: Appointment) {
    const start = formatBrazilDateTime(appointment.starts_at);
    const end = formatBrazilDateTime(appointment.ends_at);
    const procedureIds = appointment.procedures?.length
      ? appointment.procedures.map((procedure) => procedure.id)
      : appointment.procedure_id
        ? [appointment.procedure_id]
        : [];
    setError("");
    setEditForm({
      clientId: appointment.client_id,
      professionalId: appointment.professional_id ?? "",
      procedureIds: procedureIds.length ? procedureIds : [""],
      date: start.date,
      endsDate: end.date,
      startsAt: start.time,
      endsAt: end.time,
      price: appointment.price === null ? "" : String(appointment.price),
      notes: appointment.notes ?? "",
      status: appointment.status,
    });
    setEditingAppointment(appointment);
  }

  function handleEditProcedureChange(index: number, procedureId: string) {
    setEditForm((current) => {
      const procedureIds = [...current.procedureIds];
      procedureIds[index] = procedureId;
      return { ...current, procedureIds };
    });
  }

  function addEditProcedureRow() {
    setEditForm((current) => ({
      ...current,
      procedureIds: [...current.procedureIds, ""],
    }));
  }

  function removeEditProcedureAt(index: number) {
    setEditForm((current) => {
      const procedureIds = current.procedureIds.filter(
        (_, position) => position !== index
      );
      return {
        ...current,
        procedureIds: procedureIds.length ? procedureIds : [""],
      };
    });
  }

  async function saveAppointmentChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAppointment) return;

    setEditSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/appointments/${editingAppointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: editForm.clientId,
          professionalId: editForm.professionalId,
          procedureIds: editForm.procedureIds.filter(Boolean),
          startsAt: brazilDateTimeToIso(editForm.date, editForm.startsAt),
          endsAt: brazilDateTimeToIso(editForm.endsDate, editForm.endsAt),
          ...(editForm.price.trim() ? { price: Number(editForm.price) } : {}),
          notes: editForm.notes,
          status: editForm.status,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível corrigir o atendimento.");
      }

      setSelectedDate(editForm.date);
      setUpcomingView(false);
      await loadData(editForm.date, false);
      setEditingAppointment(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível corrigir o atendimento."
      );
    } finally {
      setEditSaving(false);
    }
  }

  function openPayment(appointment: Appointment) {
    setPaymentError("");

    setPaymentForm({
      methods: [
        {
          paymentMethod: "pix",
          amount:
            appointment.price !== null
              ? String(appointment.price)
              : "",
        },
      ],
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
      const total = paymentForm.methods.reduce((sum, method) => {
        const amount = Number(method.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);

      if (!total || total <= 0) {
        throw new Error("Informe um valor de pagamento válido.");
      }

      if (
        paymentAppointment.price !== null &&
        total > paymentAppointment.price
      ) {
        throw new Error(
          `O total não pode exceder o valor do atendimento (R$ ${paymentAppointment.price.toFixed(2)})`
        );
      }

      for (const method of paymentForm.methods) {
        const amount = Number(method.amount);

        if (!amount || amount <= 0) {
          throw new Error("Informe um valor de pagamento válido para cada forma.");
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
            paymentMethod: method.paymentMethod,
            status: "paid",
          }),
        });

        const responseText = await response.text();
        let data: Record<string, unknown> = {};

        if (responseText) {
          try {
            data = JSON.parse(responseText) as Record<string, unknown>;
          } catch {
            data = { error: "Resposta inválida do servidor." };
          }
        }

        if (!response.ok) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Não foi possível registrar o pagamento."
          );
        }
      }

      setPaidAppointments((current) =>
        current.includes(paymentAppointment.id)
          ? current
          : [...current, paymentAppointment.id]
      );

      await loadData();
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
    setAppointmentDate(selectedDate);
    setAvailabilityLoading(
      Boolean(form.professionalId && form.procedureIds.some((id) => id))
    );
    setAvailabilityError("");
    setShowForm(true);
  }

  function closeAppointmentForm() {
    setShowForm(false);
    setAvailabilityLoading(false);
    setForm({
      clientId: "",
      procedureIds: [""],
      professionalId: "",
      startsAt: "",
      endsAt: "",
      price: "",
      notes: "",
    });
    clearAppointmentDraft();
  }

  return (
    <main className="app-main-min-h bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#30463c]">
              Agenda
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#78867f]">
              Organize os atendimentos do negócio.
            </p>
          </div>

          <button
            type="button"
            disabled={formDataLoading}
            onClick={() => {
              if (showForm) {
                closeAppointmentForm();
              } else {
                openNewAppointment();
              }
            }}
            className="min-h-11 rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#25382f] disabled:cursor-wait disabled:opacity-60"
          >
            {formDataLoading
              ? "Carregando dados..."
              : showForm
                ? "Fechar"
                : "Novo agendamento"}
          </button>
        </header>

        {formSupportError && (
          <div
            role="alert"
            className="mt-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{formSupportError}</span>
            <button
              type="button"
              onClick={retryFormSupportData}
              disabled={formDataLoading}
              className="min-h-10 self-start rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60 sm:self-auto"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!showForm && (
          <section className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => changeDate(-1)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#dce5e0] px-3 py-2 text-sm"
                >
                  ←
                </button>

                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    setUpcomingView(false);
                    setSelectedDate(event.target.value);
                  }}
                  className="min-h-11 rounded-lg border border-[#dce5e0] px-3 py-2 text-sm"
                />

                <button
                  type="button"
                  onClick={() => changeDate(1)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#dce5e0] px-3 py-2 text-sm"
                >
                  →
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(brasilDateString(new Date()))
                    setUpcomingView(true);
                  }}
                  className="min-h-11 rounded-lg bg-[#edf3ef] px-3 py-2 text-sm font-medium text-[#30463c]"
                >
                  Próximos
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filtrar por profissional"
                  value={professionalFilter}
                  onChange={(event) =>
                    setProfessionalFilter(event.target.value)
                  }
                  className="min-h-11 rounded-lg border border-[#dce5e0] px-3 py-2 text-sm"
                >
                  <option value="">Todas as profissionais</option>
                  {professionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>
                      {professional.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filtrar por status"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value)
                  }
                  className="min-h-11 rounded-lg border border-[#dce5e0] px-3 py-2 text-sm"
                >
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!upcomingView && (
              <p className="mt-4 text-sm font-medium capitalize text-[#50655b]">
                {selectedDateLabel}
              </p>
            )}
          </section>
        )}

        {showForm && (
          <form
            onSubmit={createAppointment}
            className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white p-5 shadow-sm sm:p-6"
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

                <Link
                  href="/app/clientes"
                  className="mt-2 inline-block text-sm font-medium text-[#6f927f] hover:text-[#30463c]"
                >
                  + Cadastrar nova cliente
                </Link>
              </div>

              <label className="block text-sm font-medium text-[#50655b]">
                Profissional
                <select
                  aria-label="Profissional"
                  value={form.professionalId}
                  onChange={(event) => {
                    const professionalId = event.target.value;
                    const professional = professionals.find(
                      (item) => item.id === professionalId
                    );
                    const keptIds = form.procedureIds.map((id) =>
                      id &&
                      professional &&
                      professional.procedure_ids.includes(id)
                        ? id
                        : ""
                    );
                    const nextIds = keptIds.some((id) => id) ? keptIds : [""];
                    setForm((current) => ({ ...current, professionalId }));
                    applyProcedureIds(nextIds, professionalId);
                  }}
                  className="mt-2 w-full rounded-xl border border-[#dce5e0] p-3"
                >
                  <option value="">Sem profissional definido</option>
                  {professionals
                    .filter((professional) => professional.active)
                    .map((professional) => (
                      <option key={professional.id} value={professional.id}>
                        {professional.name}
                      </option>
                    ))}
                </select>
              </label>

              <ProcedureFields
                ids={form.procedureIds}
                optionsForIndex={procedureOptionsForCreate}
                onChange={handleProcedureChange}
                onAdd={addProcedureRow}
                onRemove={removeProcedureAt}
              />

              {selectedProfessional && availableProcedures.length === 0 && (
                <span className="block text-xs text-[#8a5149] md:col-span-2">
                  Esta profissional ainda não tem {labels.pluralLower} associados.
                  Associe os {labels.pluralLower} em Profissionais.
                </span>
              )}

              {(formTotals.durationMinutes > 0 || formTotals.hasAnyPrice) && (
                <AppointmentTotalsSummary
                  procedures={formTotals.procedures}
                  durationMinutes={formTotals.durationMinutes}
                  total={formTotals.price}
                  hasAnyPrice={formTotals.hasAnyPrice}
                  colSpanClassName="md:col-span-2"
                />
              )}

              <label className="block text-sm font-medium text-[#50655b]">
                Data do atendimento
                <input
                  required
                  type="date"
                  value={appointmentDate}
                  onChange={(event) => {
                    setAppointmentDate(event.target.value);
                    setAvailableSlots([]);
                    setAvailabilityError("");
                    setAvailabilityLoading(
                      Boolean(
                        form.professionalId && selectedProcedureIds.length > 0
                      )
                    );
                    setForm((current) => ({
                      ...current,
                      startsAt: "",
                      endsAt: "",
                    }));
                  }}
                  className="mt-2 w-full rounded-xl border border-[#dce5e0] p-3"
                />
              </label>

              <div className="block text-sm font-medium text-[#50655b] md:col-span-2">
                <span>Horário disponível</span>
                {!form.professionalId || selectedProcedureIds.length === 0 ? (
                  <span className="mt-2 block text-xs text-[#78867f]">
                    Selecione o profissional e o {labels.singularLower} para ver os horários disponíveis.
                  </span>
                ) : (
                  <>
                    <div
                      role="radiogroup"
                      aria-label="Horário disponível"
                      className="mt-2 flex flex-wrap gap-2"
                    >
                      {availableSlots.map((slot) => {
                        const selected = form.startsAt === slot.startsAt;
                        return (
                          <button
                            key={slot.startsAt}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                startsAt: slot.startsAt,
                                endsAt: slot.endsAt,
                              }))
                            }
                            className={`min-h-11 rounded-xl border px-3 py-2 text-sm transition ${
                              selected
                                ? "border-[#30463c] bg-[#edf3ef] font-semibold text-[#30463c]"
                                : "border-[#dce5e0] text-[#50655b] hover:bg-[#f4f7f5]"
                            }`}
                          >
                            {formatSlot(slot.startsAt)}–{formatSlot(slot.endsAt)}
                          </button>
                        );
                      })}
                    </div>
                    {availabilityError ? (
                      <span role="alert" className="mt-2 block text-xs text-red-700">
                        {availabilityError}
                      </span>
                    ) : availabilityLoading ? (
                      <span className="mt-2 block text-xs text-[#78867f]">
                        Consultando horários...
                      </span>
                    ) : availableSlots.length === 0 ? (
                      <span className="mt-2 block text-xs text-[#78867f]">
                        Não há horários disponíveis nessa data.
                      </span>
                    ) : form.startsAt === "" ? (
                      <span className="mt-2 block text-xs text-[#78867f]">
                        Selecione um horário
                      </span>
                    ) : null}
                  </>
                )}
              </div>

              <input
                type="number"
                min="0"
                step="1"
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
              disabled={
                saving ||
                availabilityLoading ||
                Boolean(availabilityError) ||
                !availableSlots.some((slot) => slot.startsAt === form.startsAt)
              }
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

        <section className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#e4ebe7] p-4 sm:p-6">
            <div>
              <h2 className="font-semibold text-[#30463c]">
                {upcomingView ? "Próximos atendimentos" : "Atendimentos do dia"}
              </h2>
              <p className="mt-1 text-xs text-[#8a9891]">
                {appointments.length} atendimento(s)
              </p>
            </div>
          </div>

          <div className="p-3 sm:p-6">
            {loading ? (
              <p className="text-sm text-[#78867f]">
                Carregando agenda...
              </p>
            ) : appointments.length === 0 ? (
              <div className="py-10 text-center">
                <p className="font-medium text-[#50655b]">
                  {upcomingView
                    ? "Nenhum próximo atendimento nos próximos 14 dias."
                    : "Nenhum atendimento para este dia."}
                </p>

                <button
                  type="button"
                  onClick={openNewAppointment}
                  disabled={formDataLoading}
                  className="mt-3 text-sm font-medium text-[#6f927f] disabled:cursor-wait disabled:opacity-60"
                >
                  Criar agendamento
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {(upcomingView
                  ? upcomingGroups
                  : [
                      {
                        date: selectedDate,
                        label: selectedDateLabel,
                        appointments,
                      },
                    ]
                ).map((group) => (
                  <section
                    key={group.date}
                    aria-label={upcomingView ? group.label : undefined}
                    className="space-y-2"
                  >
                    {upcomingView && (
                      <h3 className="text-sm font-semibold capitalize text-[#50655b]">
                        {group.label}
                      </h3>
                    )}
                    <div className="space-y-2">
                      {group.appointments.map((appointment) => {
                  const isPaid = paidAppointments.includes(
                    appointment.id
                  );
                  const isCancelled = ["cancelled", "no_show"].includes(
                    appointment.status
                  );
                  // Um atendimento cancelado/falta com pagamento registrado não
                  // deve parecer um atendimento ativo e pago.
                  const paymentBadgeLabel = isPaid
                    ? isCancelled
                      ? "Pago — atendimento cancelado"
                      : "Pago"
                    : "Pendente";
                  const paymentBadgeClass = isPaid
                    ? isCancelled
                      ? "bg-[#f4f4f2] text-[#78867f]"
                      : "bg-[#edf7ef] text-[#477152]"
                    : "bg-[#fff7e8] text-[#8a641d]";
                  const statusChanges = availableStatusChanges(appointment);
                  const primaryAction = primaryAppointmentAction(appointment, isPaid);

                  return (
                    <div
                      key={appointment.id}
                      className="rounded-xl border border-[#e4ebe7] p-3 sm:p-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                          <div className="min-w-0">
                            <Link
                              href={`/app/clientes/${appointment.client_id}`}
                              className="text-base font-semibold text-[#30463c] hover:text-[#6f927f]"
                            >
                              {appointment.client_name}
                            </Link>
                            <p className="mt-1 text-sm font-medium text-[#50655b]">
                              {appointmentProcedureLabel(
                                appointment,
                                `${labels.singular} não informado`
                              )}
                            </p>
                            {appointment.professional_name && (
                              <p className="mt-0.5 text-xs text-[#9aa59f]">
                                {appointment.professional_name}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <p className="font-medium text-[#50655b]">
                            {formatTime(appointment.starts_at)}
                          </p>
                          <span aria-hidden="true" className="text-[#b1bbb5]">·</span>
                          <p className="text-xs text-[#78867f]">
                            {appointmentDurationMinutes(appointment)} min
                          </p>
                          <span aria-hidden="true" className="text-[#b1bbb5]">·</span>
                          <p className="font-semibold text-[#30463c]">
                            {formatMoney(appointment.price)}
                          </p>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span
                            aria-label={`Status do atendimento: ${statusLabel(appointment.status)}`}
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              appointment.status === "completed"
                                ? "bg-[#edf7ef] text-[#477152]"
                                : ["cancelled", "no_show"].includes(appointment.status)
                                  ? "bg-[#fff1ee] text-[#9c4b3d]"
                                  : "bg-[#edf3ef] text-[#50655b]"
                            }`}
                          >
                            {statusLabel(appointment.status)}
                          </span>
                          <span
                            aria-label={`Status do pagamento: ${paymentBadgeLabel}`}
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${paymentBadgeClass}`}
                          >
                            {paymentBadgeLabel}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2 border-t border-[#eef2ef] pt-2">
                        {primaryAction && (
                          <button
                            type="button"
                            onClick={() => {
                              if (primaryAction.kind === "status") {
                                void updateStatus(appointment, primaryAction.value);
                              } else {
                                openPayment(appointment);
                              }
                            }}
                            disabled={
                              primaryAction.kind === "payment" &&
                              appointment.price === null
                            }
                            className="min-h-9 flex-1 rounded-xl bg-[#30463c] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#25382f] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-initial"
                          >
                            {primaryAction.label}
                          </button>
                        )}

                        <details className="relative ml-auto">
                          <summary
                            aria-label={`Mais ações para ${appointment.client_name}`}
                            className="flex min-h-9 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-[#dce5e0] text-lg text-[#50655b] hover:bg-[#f4f7f5]"
                          >
                            ⋮
                          </summary>
                          <div
                            role="menu"
                            aria-label={`Ações de ${appointment.client_name}`}
                            className="absolute right-0 z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-[#e4ebe7] bg-white p-2 shadow-lg"
                          >
                            {statusChanges
                              .filter((status) => status.value !== primaryAction?.value)
                              .map((status) => (
                                <button
                                  key={status.value}
                                  type="button"
                                  role="menuitem"
                                  onClick={(event) => {
                                    event.currentTarget.closest("details")?.removeAttribute("open");
                                    void updateStatus(appointment, status.value);
                                  }}
                                  className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[#30463c] hover:bg-[#f4f7f5]"
                                >
                                  {status.label}
                                </button>
                              ))}
                            {["scheduled", "confirmed"].includes(appointment.status) && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(event) => {
                                  event.currentTarget.closest("details")?.removeAttribute("open");
                                  if (window.confirm(`Cancelar o agendamento de ${appointment.client_name}?`)) {
                                    void updateStatus(appointment, "cancelled");
                                  }
                                }}
                                className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                              >
                                Cancelar agendamento
                              </button>
                            )}
                            {!isPaid &&
                              appointment.status !== "cancelled" &&
                              primaryAction?.kind !== "payment" && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(event) => {
                                  event.currentTarget.closest("details")?.removeAttribute("open");
                                  openPayment(appointment);
                                }}
                                disabled={appointment.price === null}
                                className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[#30463c] hover:bg-[#f4f7f5] disabled:opacity-40"
                              >
                                Registrar pagamento recebido
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(event) => {
                                event.currentTarget.closest("details")?.removeAttribute("open");
                                openAppointmentEditor(appointment);
                              }}
                              className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[#30463c] hover:bg-[#f4f7f5]"
                            >
                              Editar atendimento
                            </button>
                            {appointment.notes && (
                              <div className="mt-1 border-t border-[#eef2ef] px-3 py-2">
                                <p className="text-xs font-semibold text-[#78867f]">Observações</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-[#52635b]">
                                  {appointment.notes}
                                </p>
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    </div>
                      );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {editingAppointment && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-appointment-title"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !editSaving) {
              setEditingAppointment(null);
            }
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-6"
        >
          <form
            onSubmit={saveAppointmentChanges}
            className="mx-auto my-2 max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e4ebe7] bg-[#fbfaf8] p-5 text-[#26352f] shadow-2xl sm:my-6 sm:max-h-[calc(100dvh-3rem)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="edit-appointment-title" className="text-xl font-semibold text-[#30463c]">
                  Editar atendimento
                </h2>
                <p className="mt-1 text-sm text-[#78867f]">
                  Corrija os dados necessários. A agenda verificará novamente os horários e a disponibilidade ao salvar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAppointment(null)}
                disabled={editSaving}
                aria-label="Fechar edição do atendimento"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#dce5e0] text-lg disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-[#50655b] sm:col-span-2">
                Cliente
                <select
                  required
                  value={editForm.clientId}
                  disabled={editingAppointment.has_payments}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, clientId: event.target.value }))
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-[#dce5e0] bg-white p-3 disabled:bg-[#f1f3f2]"
                >
                  <option value="">Selecione a cliente</option>
                  {!clients.some((client) => client.id === editingAppointment.client_id) && (
                    <option value={editingAppointment.client_id}>
                      {editingAppointment.client_name} · atual
                    </option>
                  )}
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
                {editingAppointment.has_payments && (
                  <span className="mt-1 block text-xs font-normal text-[#78867f]">
                    Cliente bloqueada para preservar o vínculo com o pagamento registrado.
                  </span>
                )}
              </label>

              <label className="block text-sm font-medium text-[#50655b]">
                Profissional
                <select
                  value={editForm.professionalId}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, professionalId: event.target.value }))
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-[#dce5e0] bg-white p-3"
                >
                  <option value="">Sem profissional definido</option>
                  {editForm.professionalId &&
                    !professionals.some((item) => item.id === editForm.professionalId) && (
                      <option value={editForm.professionalId}>
                        {editingAppointment.professional_name ?? "Profissional atual"} · atual
                      </option>
                    )}
                  {professionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>
                      {professional.name}{professional.active ? "" : " · inativa"}
                    </option>
                  ))}
                </select>
              </label>

              <ProcedureFields
                ids={editForm.procedureIds}
                optionsForIndex={procedureOptionsForEdit}
                onChange={handleEditProcedureChange}
                onAdd={addEditProcedureRow}
                onRemove={removeEditProcedureAt}
              />

              {(editTotals.durationMinutes > 0 || editTotals.hasAnyPrice) && (
                <AppointmentTotalsSummary
                  procedures={editTotals.procedures}
                  durationMinutes={editTotals.durationMinutes}
                  total={editTotals.price}
                  hasAnyPrice={editTotals.hasAnyPrice}
                  colSpanClassName="sm:col-span-2"
                />
              )}

              <label className="block text-sm font-medium text-[#50655b]">
                Data
                <input
                  required
                  type="date"
                  value={editForm.date}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      date: event.target.value,
                      endsDate:
                        current.endsDate === current.date
                          ? event.target.value
                          : current.endsDate,
                    }))
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-[#dce5e0] bg-white p-3"
                />
              </label>

              {editForm.endsDate !== editForm.date && (
                <label className="block text-sm font-medium text-[#50655b]">
                  Data de término
                  <input
                    required
                    type="date"
                    value={editForm.endsDate}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, endsDate: event.target.value }))
                    }
                    className="mt-2 min-h-11 w-full rounded-xl border border-[#dce5e0] bg-white p-3"
                  />
                </label>
              )}

              <label className="block text-sm font-medium text-[#50655b]">
                Horário de início
                <input
                  required
                  type="time"
                  value={editForm.startsAt}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, startsAt: event.target.value }))
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-[#dce5e0] bg-white p-3"
                />
              </label>

              <label className="block text-sm font-medium text-[#50655b]">
                Horário de término
                <input
                  required
                  type="time"
                  value={editForm.endsAt}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, endsAt: event.target.value }))
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-[#dce5e0] bg-white p-3"
                />
              </label>

              <label className="block text-sm font-medium text-[#50655b]">
                Status do atendimento
                <select
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, status: event.target.value }))
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-[#dce5e0] bg-white p-3"
                >
                  {statuses.slice(1).map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-[#50655b]">
                Valor do atendimento
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.price}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, price: event.target.value }))
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-[#dce5e0] bg-white p-3"
                />
              </label>

              <label className="block text-sm font-medium text-[#50655b] sm:col-span-2">
                Observações
                <textarea
                  maxLength={5000}
                  rows={3}
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-[#dce5e0] bg-white p-3"
                />
              </label>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#e4ebe7] pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditingAppointment(null)}
                disabled={editSaving}
                className="min-h-11 rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="min-h-11 rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {editSaving ? "Salvando..." : "Salvar correções"}
              </button>
            </div>
          </form>
        </div>
      )}

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

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-[#78867f]">
                    Formas de pagamento
                  </p>
                  <p className="text-xs font-medium text-[#30463c]">
                    Total: R${" "}
                    {paymentForm.methods
                      .reduce((sum, m) => {
                        const amount = Number(m.amount);
                        return sum + (Number.isFinite(amount) ? amount : 0);
                      }, 0)
                      .toFixed(2)}
                  </p>
                </div>

                {paymentForm.methods.map((method, index) => (
                  <div key={index} className="mb-3 flex gap-2">
                    <select
                      value={method.paymentMethod}
                      onChange={(e) => {
                        const updated = [...paymentForm.methods];
                        updated[index].paymentMethod = e.target.value;
                        setPaymentForm({ methods: updated });
                      }}
                      className="flex-1 rounded-lg border border-[#dce5e0] px-2 py-2 text-sm"
                    >
                      {paymentMethods.map((paymentMethod) => (
                        <option
                          key={paymentMethod.value}
                          value={paymentMethod.value}
                        >
                          {paymentMethod.label}
                        </option>
                      ))}
                    </select>

                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0"
                      value={method.amount}
                      onChange={(e) => {
                        const updated = [...paymentForm.methods];
                        updated[index].amount = e.target.value;
                        setPaymentForm({ methods: updated });
                      }}
                      className="w-24 rounded-lg border border-[#dce5e0] px-2 py-2 text-sm text-right"
                    />

                    {paymentForm.methods.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = paymentForm.methods.filter(
                            (_, i) => i !== index
                          );
                          setPaymentForm({ methods: updated });
                        }}
                        className="rounded-lg px-2 text-red-600 hover:bg-red-50"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    const updated = [...paymentForm.methods];
                    updated.push({ paymentMethod: "pix", amount: "" });
                    setPaymentForm({ methods: updated });
                  }}
                  className="text-xs font-medium text-[#30463c] hover:underline"
                >
                  + Adicionar forma de pagamento
                </button>
              </div>

              {paymentAppointment.price !== null && (
                <div className="rounded-lg bg-[#f7faf8] p-3">
                  <p className="text-xs text-[#78867f]">Valor do atendimento</p>
                  <p className="text-sm font-semibold text-[#30463c]">
                    R$ {paymentAppointment.price.toFixed(2)}
                  </p>
                </div>
              )}
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
