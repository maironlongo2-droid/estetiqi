import { z } from "zod";

export const SUPPORT_CATEGORIES = [
  "technical",
  "schedule",
  "clients",
  "finance",
  "account",
  "other",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  technical: "Problema técnico",
  schedule: "Agenda e agendamentos",
  clients: "Clientes e procedimentos",
  finance: "Financeiro",
  account: "Acesso à conta",
  other: "Outro assunto",
};

export const createSupportRequestSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),

  subject: z
    .string()
    .trim()
    .min(3, "Descreva o assunto com pelo menos 3 caracteres.")
    .max(160, "Assunto muito longo."),

  description: z
    .string()
    .trim()
    .min(10, "Descreva o que aconteceu com pelo menos 10 caracteres.")
    .max(5000, "Descrição muito longa."),
});

export type CreateSupportRequestInput = z.infer<
  typeof createSupportRequestSchema
>;
