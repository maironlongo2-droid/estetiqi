import { z } from "zod";

export const createProcedureSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter pelo menos 2 caracteres.")
    .max(120, "Nome muito longo."),

  description: z
    .string()
    .trim()
    .max(5000, "Descrição muito longa.")
    .optional()
    .or(z.literal("")),

  price: z
    .number()
    .min(0, "Preço não pode ser negativo.")
    .optional(),

  durationMinutes: z
    .number()
    .int("Duração deve ser um número inteiro.")
    .positive("Duração deve ser maior que zero.")
    .optional(),

  returnIntervalDays: z
    .number()
    .int("Intervalo deve ser um número inteiro.")
    .positive("Intervalo deve ser maior que zero.")
    .optional(),

  status: z
    .enum(["active", "inactive"])
    .optional(),
});

export type CreateProcedureInput = z.infer<
  typeof createProcedureSchema
>;

export const updateProcedureSchema =
  createProcedureSchema.partial();

export type UpdateProcedureInput = z.infer<
  typeof updateProcedureSchema
>;