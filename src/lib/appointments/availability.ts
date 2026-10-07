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
