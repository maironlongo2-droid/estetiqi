import { z } from "zod";

export const createClientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter pelo menos 2 caracteres.")
    .max(120, "Nome muito longo."),

  phone: z
    .string()
    .trim()
    .max(30, "Telefone muito longo.")
    .optional()
    .or(z.literal("")),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .max(255, "E-mail muito longo.")
    .optional()
    .or(z.literal("")),

  cpf: z
    .string()
    .trim()
    .max(14, "CPF inválido.")
    .optional()
    .or(z.literal("")),

  birthDate: z
    .string()
    .optional()
    .or(z.literal("")),

  notes: z
    .string()
    .trim()
    .max(5000, "Observações muito longas.")
    .optional()
    .or(z.literal("")),

  source: z
    .string()
    .trim()
    .max(50, "Origem muito longa.")
    .optional()
    .or(z.literal("")),

  status: z
    .enum(["active", "inactive"])
    .optional(),
});

export type CreateClientInput = z.infer<
  typeof createClientSchema
>;

export const updateClientSchema =
  createClientSchema.partial();

export type UpdateClientInput = z.infer<
  typeof updateClientSchema
>;
