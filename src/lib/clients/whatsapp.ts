import { normalizePhone } from "@/lib/normalization/brazil";

export function buildWhatsAppUrl(client: {
  name: string;
  phone: string | null;
  lastProcedureName?: string | null;
  message?: string;
}) {
  const normalizedPhone = normalizePhone(client.phone);
  const phone = normalizedPhone?.replace(/\D/g, "");

  if (!phone || phone.length < 8 || phone.length > 15) {
    return null;
  }

  const firstName = client.name.trim().split(/\s+/)[0] || "tudo bem";
  const procedureName = client.lastProcedureName || "seu procedimento";
  const message =
    client.message?.trim() ||
    `Oi, ${firstName}! Tudo bem? Gostaria de conversar sobre seu retorno para ${procedureName} e verificar um horário que funcione para você.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
