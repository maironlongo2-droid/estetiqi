"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getProcedureLabels } from "@/lib/business/procedure-labels";

export type PublicProcedureOption = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  durationMinutes: number | null;
};

export type PublicProfessionalOption = {
  id: string;
  name: string;
  procedureIds: string[];
};

type Slot = { startsAt: string; endsAt: string };

type Confirmation = {
  startsAt: string;
  endsAt: string;
  professionalName: string | null;
  price: number | null;
};

const TIME_ZONE = "America/Sao_Paulo";

function todayInTimeZone(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function formatDateLong(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatPrice(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function PublicBookingForm({
  slug,
  procedures,
  professionals,
  whatsappDigits,
  businessType = null,
}: {
  slug: string;
  procedures: PublicProcedureOption[];
  professionals: PublicProfessionalOption[];
  whatsappDigits: string | null;
  businessType?: string | null;
}) {
  const labels = getProcedureLabels(businessType);
  const [selected, setSelected] = useState<string[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState(() => todayInTimeZone());
  const [slotState, setSlotState] = useState<{ key: string; slots: Slot[] }>({
    key: "",
    slots: [],
  });
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const selectedProcedures = useMemo(
    () => procedures.filter((procedure) => selected.includes(procedure.id)),
    [procedures, selected]
  );

  const totalDuration = selectedProcedures.reduce(
    (total, procedure) => total + (procedure.durationMinutes ?? 0),
    0
  );
  const totalPrice = useMemo(() => {
    if (selectedProcedures.length === 0) return null;
    if (selectedProcedures.some((procedure) => procedure.price === null)) {
      return null;
    }
    return selectedProcedures.reduce(
      (total, procedure) => total + (procedure.price ?? 0),
      0
    );
  }, [selectedProcedures]);

  const eligibleProfessionals = useMemo(
    () =>
      professionals.filter((professional) =>
        selected.every((procedureId) =>
          professional.procedureIds.includes(procedureId)
        )
      ),
    [professionals, selected]
  );

  // Profissional efetivo: mantém a escolha do usuário enquanto ela continuar
  // compatível com os procedimentos marcados. Quando só existe um profissional
  // compatível, ele é usado automaticamente.
  const effectiveProfessionalId = (() => {
    if (eligibleProfessionals.length === 1) {
      return eligibleProfessionals[0].id;
    }

    return eligibleProfessionals.some(
      (professional) => professional.id === professionalId
    )
      ? professionalId
      : "";
  })();

  // Chave da consulta de horários. Além de montar a URL, ela identifica a qual
  // seleção pertence a lista já carregada, o que permite derivar o estado de
  // carregamento sem chamar setState dentro de um efeito.
  const availabilityQuery = useMemo(() => {
    if (!effectiveProfessionalId || selected.length === 0 || !date) {
      return null;
    }

    return new URLSearchParams({
      professionalId: effectiveProfessionalId,
      procedureIds: selected.join(","),
      date,
    }).toString();
  }, [date, effectiveProfessionalId, selected]);

  const slots =
    availabilityQuery && slotState.key === availabilityQuery
      ? slotState.slots
      : [];
  const loadingSlots =
    Boolean(availabilityQuery) && slotState.key !== availabilityQuery;

  // Horário escolhido de fato: só é válido enquanto continuar na lista atual, o
  // que limpa a seleção sozinho quando os procedimentos ou a data mudam.
  const selectedSlot =
    slot && slots.some((item) => item.startsAt === slot) ? slot : null;

  // Busca os horários sempre que a seleção muda. A duração é recalculada no
  // servidor: o navegador só informa quais procedimentos foram escolhidos.
  useEffect(() => {
    if (!availabilityQuery) return;

    let active = true;
    const query = availabilityQuery;

    fetch(`/api/public/${encodeURIComponent(slug)}/availability?${query}`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok) {
          setSlotState({ key: query, slots: [] });
          setError(data?.error || "Não foi possível carregar os horários.");
          return;
        }
        setError(null);
        setSlotState({
          key: query,
          slots: Array.isArray(data?.slots) ? data.slots : [],
        });
      })
      .catch(() => {
        if (active) {
          setSlotState({ key: query, slots: [] });
          setError("Não foi possível carregar os horários.");
        }
      });

    return () => {
      active = false;
    };
  }, [availabilityQuery, slug]);

  const toggleProcedure = useCallback((procedureId: string) => {
    setError(null);
    setSelected((current) =>
      current.includes(procedureId)
        ? current.filter((id) => id !== procedureId)
        : [...current, procedureId]
    );
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (selected.length === 0) {
      setError(`Escolha pelo menos um ${labels.singularLower}.`);
      return;
    }
    if (!effectiveProfessionalId) {
      setError("Escolha o profissional.");
      return;
    }
    if (!selectedSlot) {
      setError("Escolha um horário disponível.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Informe seu nome completo.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Informe um telefone com DDD.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/public/${encodeURIComponent(slug)}/appointments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            procedureIds: selected,
            professionalId: effectiveProfessionalId,
            startsAt: selectedSlot,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.appointment) {
        setError(data?.error || "Não foi possível concluir o agendamento.");
        // Um conflito de horário invalida a lista atual: recarrega os horários.
        if (response.status === 409) {
          setSlot(null);
          setSlotState((current) => ({
            key: current.key,
            slots: current.slots.filter(
              (item) => item.startsAt !== selectedSlot
            ),
          }));
        }
        return;
      }

      setConfirmation({
        startsAt: data.appointment.startsAt,
        endsAt: data.appointment.endsAt,
        professionalName: data.appointment.professionalName,
        price: data.appointment.price,
      });
    } catch {
      setError("Não foi possível concluir o agendamento.");
    } finally {
      setSubmitting(false);
    }
  }

  const whatsappLink = (() => {
    if (!whatsappDigits) return null;
    const message = encodeURIComponent(
      "Olá! Acabei de fazer um agendamento pelo seu link."
    );
    return `https://wa.me/${whatsappDigits}?text=${message}`;
  })();

  if (confirmation) {
    return (
      <section className="rounded-3xl border border-[#e2ebe5] bg-white p-6 sm:p-8">
        <p className="text-sm font-medium text-[#527765]">
          Agendamento solicitado
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[#30463c]">
          Tudo certo! Seu horário foi reservado.
        </h2>
        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[#6d7d75]">Data</dt>
            <dd className="font-medium text-[#30463c]">
              {formatDateLong(confirmation.startsAt.slice(0, 10))}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#6d7d75]">Horário</dt>
            <dd className="font-medium text-[#30463c]">
              {formatTime(confirmation.startsAt)} –{" "}
              {formatTime(confirmation.endsAt)}
            </dd>
          </div>
          {confirmation.professionalName ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#6d7d75]">Profissional</dt>
              <dd className="font-medium text-[#30463c]">
                {confirmation.professionalName}
              </dd>
            </div>
          ) : null}
          {confirmation.price !== null ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#6d7d75]">Valor</dt>
              <dd className="font-medium text-[#30463c]">
                {formatPrice(confirmation.price)}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {whatsappLink ? (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-[#0f766e] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0c5f59]"
            >
              Falar no WhatsApp
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setConfirmation(null);
              setSelected([]);
              setSlot(null);
              setName("");
              setPhone("");
            }}
            className="inline-flex items-center justify-center rounded-full border border-[#d5e2da] px-6 py-3 text-sm font-semibold text-[#30463c] transition hover:bg-[#f1f6f3]"
          >
            Fazer outro agendamento
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8 rounded-3xl border border-[#e2ebe5] bg-white p-6 sm:p-8"
    >
      <fieldset>
        <legend className="text-lg font-semibold text-[#30463c]">
          1. Escolha os {labels.pluralLower}
        </legend>
        <div className="mt-4 space-y-3">
          {procedures.map((procedure) => {
            const checked = selected.includes(procedure.id);
            const price = formatPrice(procedure.price);
            return (
              <label
                key={procedure.id}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                  checked
                    ? "border-[#0f766e] bg-[#f1f6f3]"
                    : "border-[#e2ebe5] hover:border-[#c4d8cc]"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[#0f766e]"
                  checked={checked}
                  onChange={() => toggleProcedure(procedure.id)}
                />
                <span className="flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-[#30463c]">
                      {procedure.name}
                    </span>
                    <span className="text-sm text-[#6d7d75]">
                      {price ? `${price} · ` : ""}
                      {procedure.durationMinutes
                        ? `${procedure.durationMinutes} min`
                        : "duração a combinar"}
                    </span>
                  </span>
                  {procedure.description ? (
                    <span className="mt-1 block text-sm text-[#6d7d75]">
                      {procedure.description}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {selected.length > 0 ? (
        <fieldset>
          <legend className="text-lg font-semibold text-[#30463c]">
            2. Escolha o profissional
          </legend>
          {eligibleProfessionals.length === 0 ? (
            <p className="mt-3 text-sm text-[#a87483]">
              Nenhum profissional realiza todos os {labels.pluralLower} escolhidos.
              Ajuste a seleção.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              {eligibleProfessionals.map((professional) => {
                const active = effectiveProfessionalId === professional.id;
                return (
                  <button
                    key={professional.id}
                    type="button"
                    onClick={() => setProfessionalId(professional.id)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      active
                        ? "border-[#0f766e] bg-[#0f766e] text-white"
                        : "border-[#d5e2da] text-[#30463c] hover:bg-[#f1f6f3]"
                    }`}
                  >
                    {professional.name}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
      ) : null}

      {effectiveProfessionalId ? (
        <fieldset>
          <legend className="text-lg font-semibold text-[#30463c]">
            3. Escolha o dia e o horário
          </legend>
          <input
            type="date"
            value={date}
            min={todayInTimeZone()}
            onChange={(event) => setDate(event.target.value)}
            className="mt-4 rounded-2xl border border-[#d5e2da] px-4 py-3 text-sm text-[#30463c]"
          />
          <div className="mt-4">
            {loadingSlots ? (
              <p className="text-sm text-[#6d7d75]">Carregando horários…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-[#6d7d75]">
                Nenhum horário livre nesse dia. Tente outra data.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((item) => {
                  const active = selectedSlot === item.startsAt;
                  return (
                    <button
                      key={item.startsAt}
                      type="button"
                      onClick={() => setSlot(item.startsAt)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                        active
                          ? "border-[#0f766e] bg-[#0f766e] text-white"
                          : "border-[#d5e2da] text-[#30463c] hover:bg-[#f1f6f3]"
                      }`}
                    >
                      {formatTime(item.startsAt)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </fieldset>
      ) : null}

      {selectedSlot ? (
        <fieldset>
          <legend className="text-lg font-semibold text-[#30463c]">
            4. Seus dados
          </legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#6d7d75]">Nome completo</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
                className="rounded-2xl border border-[#d5e2da] px-4 py-3 text-[#30463c]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#6d7d75]">WhatsApp (com DDD)</span>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                required
                className="rounded-2xl border border-[#d5e2da] px-4 py-3 text-[#30463c]"
              />
            </label>
          </div>
        </fieldset>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-2xl bg-[#f4e4e8] px-4 py-3 text-sm text-[#a87483]"
        >
          {error}
        </p>
      ) : null}

      <div className="border-t border-[#eef3f0] pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#6d7d75]">
          <span>
            {selected.length === 0
              ? `Selecione ao menos um ${labels.singularLower}`
              : `${selected.length} ${labels.singularLower}(s) · ${
                  totalDuration > 0
                    ? `${totalDuration} min`
                    : "duração a combinar"
                }`}
          </span>
          {totalPrice !== null ? (
            <span className="font-semibold text-[#30463c]">
              {formatPrice(totalPrice)}
            </span>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={submitting || !selectedSlot}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[#0f766e] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0c5f59] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Agendando…" : "Confirmar agendamento"}
        </button>
      </div>
    </form>
  );
}


