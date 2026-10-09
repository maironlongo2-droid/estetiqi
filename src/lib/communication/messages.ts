// Central de Comunicação — montagem das mensagens manuais (confirmação de
// agendamento, pós-atendimento e retorno) e normalização do contato.
//
// Este módulo é puro (sem acesso a banco, rede ou segredos) para poder ser
// reutilizado tanto no navegador (Central de Comunicação e Agenda) quanto no
// servidor. Ele apenas monta texto com dados reais já conhecidos: nunca inventa
// valores, horários, descontos, orientações clínicas ou a existência de
// documentos. O link do WhatsApp é gerado com o número já normalizado; quando o
// número é inválido a função devolve null e a interface não oferece o link.

import { buildDefaultReturnMessage } from "@/lib/ai/return-message";
import { normalizeWhatsapp } from "@/lib/public/contact-links";

// Fuso usado em todo o produto para exibir datas e horários.
export const COMMUNICATION_TIME_ZONE = "America/Sao_Paulo";

// Categorias de mensagem. Transacionais (agendamento) e pós-atendimento são
// tratadas separadamente das promocionais (retorno/campanha), para que a
// profissional saiba que uma mensagem de retorno depende do consentimento da
// cliente.
export const COMMUNICATION_CATEGORIES = [
  "transacional",
  "pos_atendimento",
  "promocional",
] as const;

export type CommunicationCategory = (typeof COMMUNICATION_CATEGORIES)[number];

export const COMMUNICATION_CATEGORY_LABELS: Record<
  CommunicationCategory,
  string
> = {
  transacional: "Transacional",
  pos_atendimento: "Pós-atendimento",
  promocional: "Promocional",
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

// Primeiro nome da cliente, usado em saudações. Quando ausente, o texto não
// inventa um nome nem deixa um placeholder visível.
export function personFirstName(name: string | null | undefined) {
  return clean(name).split(/\s+/)[0] || "";
}

export type AppointmentMoment = {
  dateLabel: string;
  timeLabel: string;
};

// Data e hora locais do atendimento (fuso do produto), em português. Usa os
// dados reais do agendamento; quando a data é inválida devolve rótulos vazios e
// a mensagem é montada sem eles.
export function formatAppointmentMoment(
  startsAt: string | null | undefined
): AppointmentMoment {
  if (!startsAt) return { dateLabel: "", timeLabel: "" };
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return { dateLabel: "", timeLabel: "" };

  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: COMMUNICATION_TIME_ZONE,
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: COMMUNICATION_TIME_ZONE,
  }).format(date);

  return { dateLabel, timeLabel };
}

export type ConfirmationMessageInput = {
  clientName: string | null | undefined;
  procedureName?: string | null;
  professionalName?: string | null;
  businessName?: string | null;
  startsAt: string | null | undefined;
};

// Mensagem transacional de confirmação de agendamento. Monta apenas o que
// existe: sem nome de negócio, de profissional ou de procedimento, as partes
// correspondentes são omitidas em vez de exibir placeholders.
export function buildAppointmentConfirmationMessage(
  input: ConfirmationMessageInput
) {
  const firstName = personFirstName(input.clientName);
  const business = clean(input.businessName);
  const procedure = clean(input.procedureName);
  const professional = clean(input.professionalName);
  const { dateLabel, timeLabel } = formatAppointmentMoment(input.startsAt);

  const greeting = firstName ? `Olá, ${firstName}!` : "Olá!";
  const parts: string[] = [];

  let appointmentSentence = "Seu agendamento";
  if (business) appointmentSentence += ` no ${business}`;
  if (dateLabel && timeLabel) {
    appointmentSentence += ` está previsto para ${dateLabel}, às ${timeLabel}`;
  } else if (dateLabel) {
    appointmentSentence += ` está previsto para ${dateLabel}`;
  } else {
    appointmentSentence += " está marcado";
  }
  if (procedure) appointmentSentence += `, para ${procedure}`;
  appointmentSentence += ".";
  parts.push(appointmentSentence);

  if (professional) {
    parts.push(`Profissional responsável: ${professional}.`);
  }

  parts.push("Se precisar de alguma alteração, entre em contato conosco.");

  return `${greeting} ${parts.join(" ")}`;
}

export type PostAttendanceMessageInput = {
  clientName: string | null | undefined;
  procedureName?: string | null;
  businessName?: string | null;
};

// Mensagem pós-atendimento. Não afirma que documentos ou orientações foram
// enviados e não promete resultados; apenas abre espaço para a cliente tirar
// dúvidas com a profissional responsável.
export function buildPostAttendanceMessage(input: PostAttendanceMessageInput) {
  const firstName = personFirstName(input.clientName);
  const business = clean(input.businessName);
  const procedure = clean(input.procedureName);

  const greeting = firstName ? `Olá, ${firstName}!` : "Olá!";
  const parts: string[] = [];

  let thanksSentence = "Obrigada por realizar seu atendimento";
  if (procedure) thanksSentence += ` de ${procedure}`;
  if (business) thanksSentence += ` no ${business}`;
  thanksSentence += ".";
  parts.push(thanksSentence);

  parts.push(
    "Se tiver dúvidas ou alguma preocupação relacionada ao atendimento, entre em contato com a profissional responsável."
  );

  return `${greeting} ${parts.join(" ")}`;
}

export type ReturnMessageInput = {
  clientName: string | null | undefined;
  lastProcedureName?: string | null;
};

// Mensagem promocional de retorno/reativação. Reutiliza a mensagem-padrão já
// usada pela IA quando o Gemini não está disponível, mantendo um único texto de
// referência no produto.
export function buildReturnMessage(input: ReturnMessageInput) {
  return buildDefaultReturnMessage({
    name: input.clientName,
    lastProcedureName: input.lastProcedureName,
  });
}

// Número no formato aceito pelo wa.me (código do país + DDD + número) ou null
// quando o valor não forma um número utilizável. Reutiliza a normalização do
// cartão digital para manter uma única regra no produto.
export function normalizeContactPhone(phone: string | null | undefined) {
  return normalizeWhatsapp(phone);
}

export function hasValidContactPhone(phone: string | null | undefined) {
  return normalizeContactPhone(phone) !== null;
}

// Link do WhatsApp com a mensagem já codificada. Devolve null quando o número é
// inválido (nunca gera link para um contato inválido).
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string
) {
  const number = normalizeContactPhone(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
