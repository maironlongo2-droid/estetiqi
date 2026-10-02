import { z } from "zod";

const appointmentFields = z.object({
  clientId: z.string().uuid("Cliente inválido."),

  procedureId: z
    .string()
    .uuid("Procedimento inválido.")
    .optional()
    .or(z.literal("")),

  professionalName: z
    .string()
    .trim()
    .max(120, "Nome do profissional muito longo.")
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

export const createAppointmentSchema = appointmentFields.refine(
  (data) =>
    new Date(data.endsAt).getTime() >
    new Date(data.startsAt).getTime(),
  {
    message:
      "O horário de término deve ser posterior ao horário de início.",
    path: ["endsAt"],
  }
);

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
  );

export type UpdateAppointmentInput = z.infer<
  typeof updateAppointmentSchema
>;