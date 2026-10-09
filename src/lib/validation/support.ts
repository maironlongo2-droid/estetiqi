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

// Situações que o responsável pela plataforma pode definir na central de
// suporte. O banco ainda aceita 'closed', mas a interface trabalha com estes
// três estados.
export const SUPPORT_EDITABLE_STATUSES = [
  "open",
  "in_progress",
  "resolved",
] as const;

export type SupportEditableStatus = (typeof SUPPORT_EDITABLE_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  resolved: "Resolvida",
  closed: "Fechada",
};

// Limite compartilhado entre a descrição inicial e as mensagens da conversa.
export const SUPPORT_MESSAGE_MAX_LENGTH = 5000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valida o identificador antes de chegar ao banco: um UUID malformado não pode
// virar 500 (erro de sintaxe no Postgres) quando o recurso simplesmente não
// corresponde a nenhum registro.
export const supportIdSchema = z
  .string()
  .regex(UUID_PATTERN, "Identificador inválido.");

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
    .max(SUPPORT_MESSAGE_MAX_LENGTH, "Descrição muito longa."),
});

export type CreateSupportRequestInput = z.infer<
  typeof createSupportRequestSchema
>;

// Mensagem enviada dentro de uma solicitação, tanto pela cliente quanto pela
// equipe de suporte. Mesmo limite da descrição inicial.
export const createSupportMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Escreva uma mensagem.")
    .max(SUPPORT_MESSAGE_MAX_LENGTH, "Mensagem muito longa."),
});

export type CreateSupportMessageInput = z.infer<
  typeof createSupportMessageSchema
>;

export const updateSupportStatusSchema = z.object({
  status: z.enum(SUPPORT_EDITABLE_STATUSES),
});

export type UpdateSupportStatusInput = z.infer<
  typeof updateSupportStatusSchema
>;
