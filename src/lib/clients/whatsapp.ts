import { buildDefaultReturnMessage } from "@/lib/ai/return-message";
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

  const message =
    client.message?.trim() ||
    buildDefaultReturnMessage({
      name: client.name,
      lastProcedureName: client.lastProcedureName,
    });

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
