import { z } from "zod";

const appointmentFields = z.object({
  clientId: z.string().uuid("Cliente inválido."),

  // Compatibilidade: agendamentos antigos (e integrações) enviam um único
  // procedimento neste campo. Continua aceito e representa o principal.
  procedureId: z
    .string()
    .uuid("Procedimento inválido.")
    .optional()
    .or(z.literal("")),

  // Lista de procedimentos do atendimento (na ordem escolhida).
  procedureIds: z
    .array(z.string().uuid("Procedimento inválido."))
    .max(20, "Muitos procedimentos no mesmo agendamento.")
    .optional(),

  professionalId: z
    .string()
    .uuid("Profissional inválido.")
    .optional()
    .or(z.literal("")),

  startsAt: z.string().datetime({
    message: "Data de início inválida.",
  }),

  endsAt: z.string().datetime({
    message: "Data de término inválida.",
  }),

  price: z
    .number()
    .min(0, "Preço não pode ser negativo.")
    .optional(),

  notes: z
    .string()
    .trim()
    .max(5000, "Observações muito longas.")
    .optional()
    .or(z.literal("")),

  status: z
    .enum([
      "scheduled",
      "confirmed",
      "completed",
      "cancelled",
      "no_show",
    ])
    .optional(),
});

function hasDuplicateProcedures(data: { procedureIds?: string[] }) {
  if (!data.procedureIds || data.procedureIds.length < 2) return false;
  return new Set(data.procedureIds).size !== data.procedureIds.length;
}

const noDuplicateProcedures = {
  message: "Não é possível repetir o mesmo procedimento no agendamento.",
  path: ["procedureIds"],
};

export const createAppointmentSchema = appointmentFields
  .refine(
    (data) =>
      new Date(data.endsAt).getTime() >
      new Date(data.startsAt).getTime(),
    {
      message:
        "O horário de término deve ser posterior ao horário de início.",
      path: ["endsAt"],
    }
  )
  .refine((data) => !hasDuplicateProcedures(data), noDuplicateProcedures);

export type CreateAppointmentInput = z.infer<
  typeof createAppointmentSchema
>;

export const updateAppointmentSchema = appointmentFields
  .partial()
  .refine(
    (data) => {
      if (
        data.startsAt === undefined ||
        data.endsAt === undefined
      ) {
        return true;
      }

      return (
        new Date(data.endsAt).getTime() >
        new Date(data.startsAt).getTime()
      );
    },
    {
      message:
        "O horário de término deve ser posterior ao horário de início.",
      path: ["endsAt"],
    }
  )
  .refine((data) => !hasDuplicateProcedures(data), noDuplicateProcedures);

export type UpdateAppointmentInput = z.infer<
  typeof updateAppointmentSchema
>;