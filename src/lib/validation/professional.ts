import { z } from "zod";

const procedureIdsSchema = z.array(z.string().uuid()).max(100).refine(
  (ids) => new Set(ids).size === ids.length,
  "Não repita procedimentos."
);

export const professionalSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  active: z.boolean().optional(),
  procedureIds: procedureIdsSchema.optional(),
});

export const updateProfessionalSchema = professionalSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0);

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const intervalSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startsAt: timeSchema,
    endsAt: timeSchema,
  })
  .refine((interval) => interval.endsAt > interval.startsAt, {
    path: ["endsAt"],
    message: "O horário final deve ser posterior ao inicial.",
  });

const exceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kind: z.enum(["blocked", "available"]),
    startsAt: timeSchema.optional().nullable(),
    endsAt: timeSchema.optional().nullable(),
    reason: z.string().trim().max(180).optional(),
  })
  .refine(
    (exception) =>
      (exception.startsAt == null) === (exception.endsAt == null) &&
      (exception.kind !== "available" || exception.startsAt != null) &&
      (exception.startsAt == null ||
        exception.endsAt! > exception.startsAt),
    {
      path: ["endsAt"],
      message: "Informe um intervalo válido para a exceção.",
    }
  )
  .refine((exception) => {
    const parsed = new Date(`${exception.date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === exception.date;
  }, {
    path: ["date"],
    message: "Data inválida.",
  });

export const availabilitySchema = z.object({
  weekly: z.array(intervalSchema).max(42),
  exceptions: z.array(exceptionSchema).max(100),
});

export type ProfessionalInput = z.infer<typeof professionalSchema>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
