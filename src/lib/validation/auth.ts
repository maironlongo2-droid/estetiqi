import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter pelo menos 2 caracteres.")
    .max(120, "Nome muito longo."),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .max(255, "E-mail muito longo."),

  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .max(128, "Senha muito longa."),

  organizationName: z
    .string()
    .trim()
    .min(2, "Nome da organização deve ter pelo menos 2 caracteres.")
    .max(120, "Nome da organização muito longo."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .max(255, "E-mail muito longo."),

  password: z
    .string()
    .min(1, "Senha obrigatória.")
    .max(128, "Senha muito longa."),
});

export type LoginInput = z.infer<typeof loginSchema>;