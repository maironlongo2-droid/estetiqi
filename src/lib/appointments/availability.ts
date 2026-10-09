import { sql } from "@/lib/db/client";

type AvailabilityInterval = {
  starts_at: string;
  ends_at: string;
};

type AvailabilityException = {
  kind: "blocked" | "available";
  starts_at: string | null;
  ends_at: string | null;
};

type OccupiedInterval = {
  starts_at: string | Date;
  ends_at: string | Date;
};

type ProfessionalAvailability = {
  isAvailable: boolean;
  reason?: "outside_working_hours" | "blocked" | "appointment_conflict";
};

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function localDateAndMinutes(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const minutes =
    Number(part("hour")) * 60 +
    Number(part("minute")) +
    Number(part("second")) / 60 +
    value.getMilliseconds() / 60_000;
  return { date, minutes };
}

// Data (no fuso da agenda) correspondente a um instante. Permite casar um
// horário escolhido no fluxo público com a lista de horários ofertados sem
// duplicar a regra de fuso horário.
export function localDateInSaoPaulo(value: Date) {
  return localDateAndMinutes(value).date;
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && end > otherStart;
}

function workingIntervals(
  weekly: AvailabilityInterval[],
  exceptions: AvailabilityException[]
) {
  const exceptionalAvailability = exceptions
    .filter(
      (exception): exception is AvailabilityException & {
        starts_at: string;
        ends_at: string;
      } =>
        exception.kind === "available" &&
        exception.starts_at !== null &&
        exception.ends_at !== null
    )
    .map((exception) => ({
      starts_at: exception.starts_at,
      ends_at: exception.ends_at,
    }));

  return exceptionalAvailability.length ? exceptionalAvailability : weekly;
}

async function loadAvailability(
  organizationId: string,
  professionalId: string,
  date: string,
  excludeAppointmentId?: string
) {
  const [weekly, exceptions, appointments] = await Promise.all([
    sql`
      SELECT starts_at::text, ends_at::text
      FROM professional_weekly_availability
      WHERE organization_id = ${organizationId}
        AND professional_id = ${professionalId}
        AND weekday = EXTRACT(DOW FROM ${date}::date)::int
      ORDER BY starts_at
    `,
    sql`
      SELECT kind, starts_at::text, ends_at::text
      FROM professional_availability_exceptions
      WHERE organization_id = ${organizationId}
        AND professional_id = ${professionalId}
        AND exception_date = ${date}::date
    `,
    sql`
      SELECT starts_at, ends_at
      FROM appointments
      WHERE organization_id = ${organizationId}
        AND (
          professional_id = ${professionalId}
          OR (
            professional_id IS NULL
            AND professional_name = (
              SELECT name
              FROM professionals
              WHERE id = ${professionalId}
                AND organization_id = ${organizationId}
            )
          )
        )
        AND status NOT IN ('cancelled', 'no_show')
        AND starts_at < ((${date}::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')
        AND ends_at > (${date}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
        AND (${excludeAppointmentId ?? null}::uuid IS NULL OR id <> ${excludeAppointmentId ?? null}::uuid)
    `,
  ]);

  return {
    weekly: weekly as AvailabilityInterval[],
    exceptions: exceptions as AvailabilityException[],
    appointments: appointments as OccupiedInterval[],
  };
}

export async function checkProfessionalAvailability(input: {
  organizationId: string;
  professionalId: string;
  startsAt: Date;
  endsAt: Date;
  excludeAppointmentId?: string;
}): Promise<ProfessionalAvailability> {
  const { date, minutes: startMinutes } = localDateAndMinutes(input.startsAt);
  const end = localDateAndMinutes(input.endsAt);
  const endMinutes = end.minutes + (end.date > date ? 24 * 60 : 0);

  if (end.date !== date) {
    return { isAvailable: false, reason: "outside_working_hours" };
  }

  const availability = await loadAvailability(
    input.organizationId,
    input.professionalId,
    date,
    input.excludeAppointmentId
  );

  const intervals = workingIntervals(
    availability.weekly,
    availability.exceptions
  );

  const fitsWorkingHours = intervals.some(
    (interval) =>
      startMinutes >= timeToMinutes(interval.starts_at) &&
      endMinutes <= timeToMinutes(interval.ends_at)
  );
  if (!fitsWorkingHours) {
    return { isAvailable: false, reason: "outside_working_hours" };
  }

  const isBlocked = availability.exceptions.some((exception) => {
    if (exception.kind !== "blocked") return false;
    if (exception.starts_at === null || exception.ends_at === null) return true;
    return overlaps(
      startMinutes,
      endMinutes,
      timeToMinutes(exception.starts_at),
      timeToMinutes(exception.ends_at)
    );
  });
  if (isBlocked) return { isAvailable: false, reason: "blocked" };

  const startTimestamp = input.startsAt.getTime();
  const endTimestamp = input.endsAt.getTime();
  const hasConflict = availability.appointments.some((appointment) =>
    startTimestamp < new Date(appointment.ends_at).getTime() &&
    endTimestamp > new Date(appointment.starts_at).getTime()
  );
  if (hasConflict) {
    return { isAvailable: false, reason: "appointment_conflict" };
  }

  return { isAvailable: true };
}

export async function getAvailableAppointmentSlots(input: {
  organizationId: string;
  professionalId: string;
  date: string;
  durationMinutes: number;
}) {
  const availability = await loadAvailability(
    input.organizationId,
    input.professionalId,
    input.date
  );

  const intervals = workingIntervals(
    availability.weekly,
    availability.exceptions
  );

  const blockedIntervals = availability.exceptions.filter(
    (exception) => exception.kind === "blocked"
  );

  const slots: Array<{ startsAt: string; endsAt: string }> = [];
  for (let startMinutes = 0; startMinutes + input.durationMinutes <= 24 * 60; startMinutes += 15) {
    const endMinutes = startMinutes + input.durationMinutes;
    const fitsWorkingHours = intervals.some(
      (interval) =>
        startMinutes >= timeToMinutes(interval.starts_at) &&
        endMinutes <= timeToMinutes(interval.ends_at)
    );
    if (!fitsWorkingHours) continue;

    const blocked = blockedIntervals.some((interval) => {
      if (interval.starts_at === null || interval.ends_at === null) return true;
      return overlaps(
        startMinutes,
        endMinutes,
        timeToMinutes(interval.starts_at),
        timeToMinutes(interval.ends_at)
      );
    });
    if (blocked) continue;

    const startsAt = new Date(
      `${input.date}T${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}:00-03:00`
    );
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
    const hasConflict = availability.appointments.some((appointment) =>
      startsAt.getTime() < new Date(appointment.ends_at).getTime() &&
      endsAt.getTime() > new Date(appointment.starts_at).getTime()
    );
    if (hasConflict) continue;

    slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  }

  return slots;
}

// Verifica se um dia específico tem pelo menos um horário livre para a duração
// pedida, usando os mesmos intervalos/regras de getAvailableAppointmentSlots.
function dayHasFreeSlot(input: {
  date: string;
  durationMinutes: number;
  weekly: AvailabilityInterval[];
  exceptions: AvailabilityException[];
  appointments: OccupiedInterval[];
  now: number;
}): boolean {
  const intervals = workingIntervals(input.weekly, input.exceptions);
  if (intervals.length === 0) return false;

  const blockedIntervals = input.exceptions.filter(
    (exception) => exception.kind === "blocked"
  );

  for (
    let startMinutes = 0;
    startMinutes + input.durationMinutes <= 24 * 60;
    startMinutes += 15
  ) {
    const endMinutes = startMinutes + input.durationMinutes;
    const fitsWorkingHours = intervals.some(
      (interval) =>
        startMinutes >= timeToMinutes(interval.starts_at) &&
        endMinutes <= timeToMinutes(interval.ends_at)
    );
    if (!fitsWorkingHours) continue;

    const blocked = blockedIntervals.some((interval) => {
      if (interval.starts_at === null || interval.ends_at === null) return true;
      return overlaps(
        startMinutes,
        endMinutes,
        timeToMinutes(interval.starts_at),
        timeToMinutes(interval.ends_at)
      );
    });
    if (blocked) continue;

    const startsAt = new Date(
      `${input.date}T${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}:00-03:00`
    );
    if (startsAt.getTime() <= input.now) continue;

    const endsAt = startsAt.getTime() + input.durationMinutes * 60_000;
    const hasConflict = input.appointments.some(
      (appointment) =>
        startsAt.getTime() < new Date(appointment.ends_at).getTime() &&
        endsAt > new Date(appointment.starts_at).getTime()
    );
    if (hasConflict) continue;

    return true;
  }

  return false;
}

// Lista os dias (YYYY-MM-DD) de um mês em que há pelo menos um horário livre
// para a combinação escolhida. Carrega a disponibilidade semanal, as exceções e
// os agendamentos do mês uma única vez e avalia cada dia em memória, evitando
// uma consulta por dia. Datas passadas ficam de fora.
export async function getAvailableDatesInMonth(input: {
  organizationId: string;
  professionalId: string;
  month: string;
  durationMinutes: number;
}): Promise<string[]> {
  const [yearText, monthText] = input.month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return [];
  }

  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const monthStart = `${input.month}-01`;
  const monthEndExclusive = new Date(Date.UTC(year, monthIndex + 1, 1))
    .toISOString()
    .slice(0, 10);

  const [weeklyRows, exceptionRows, appointmentRows] = await Promise.all([
    sql`
      SELECT weekday, starts_at::text, ends_at::text
      FROM professional_weekly_availability
      WHERE organization_id = ${input.organizationId}
        AND professional_id = ${input.professionalId}
      ORDER BY starts_at
    `,
    sql`
      SELECT
        exception_date::text AS exception_date,
        kind,
        starts_at::text,
        ends_at::text
      FROM professional_availability_exceptions
      WHERE organization_id = ${input.organizationId}
        AND professional_id = ${input.professionalId}
        AND exception_date >= ${monthStart}::date
        AND exception_date < ${monthEndExclusive}::date
    `,
    sql`
      SELECT starts_at, ends_at
      FROM appointments
      WHERE organization_id = ${input.organizationId}
        AND (
          professional_id = ${input.professionalId}
          OR (
            professional_id IS NULL
            AND professional_name = (
              SELECT name
              FROM professionals
              WHERE id = ${input.professionalId}
                AND organization_id = ${input.organizationId}
            )
          )
        )
        AND status NOT IN ('cancelled', 'no_show')
        AND starts_at < (${monthEndExclusive}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
        AND ends_at > (${monthStart}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
    `,
  ]);

  const weeklyByWeekday = new Map<number, AvailabilityInterval[]>();
  for (const row of weeklyRows as Array<
    AvailabilityInterval & { weekday: number }
  >) {
    const list = weeklyByWeekday.get(row.weekday) ?? [];
    list.push({ starts_at: row.starts_at, ends_at: row.ends_at });
    weeklyByWeekday.set(row.weekday, list);
  }

  const exceptionsByDate = new Map<string, AvailabilityException[]>();
  for (const row of exceptionRows as Array<
    AvailabilityException & { exception_date: string }
  >) {
    const list = exceptionsByDate.get(row.exception_date) ?? [];
    list.push({
      kind: row.kind,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
    });
    exceptionsByDate.set(row.exception_date, list);
  }

  const appointments = appointmentRows as OccupiedInterval[];
  const now = Date.now();
  const today = localDateInSaoPaulo(new Date());

  const availableDates: string[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${input.month}-${String(day).padStart(2, "0")}`;
    if (date < today) continue;

    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const hasSlot = dayHasFreeSlot({
      date,
      durationMinutes: input.durationMinutes,
      weekly: weeklyByWeekday.get(weekday) ?? [],
      exceptions: exceptionsByDate.get(date) ?? [],
      appointments,
      now,
    });

    if (hasSlot) availableDates.push(date);
  }

  return availableDates;
}
