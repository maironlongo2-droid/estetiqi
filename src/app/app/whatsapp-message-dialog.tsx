"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./toast";
import {
  buildWhatsAppLink,
  COMMUNICATION_CATEGORY_LABELS,
  hasValidContactPhone,
  type CommunicationCategory,
} from "@/lib/communication/messages";

// Diálogo de preparação de mensagem reutilizado pela Agenda, pela Central de
// Comunicação (confirmações, pós-atendimento e protocolos) e pelos contatos de
// retorno. A profissional revisa o texto, pode copiá-lo e pode abrir o WhatsApp.
//
// Importante: abrir o WhatsApp NÃO comprova o envio. O diálogo diferencia três
// estados — "Preparada", "WhatsApp aberto" e "Envio manual confirmado" (quando
// a própria profissional declara que enviou) — e deixa claro que essas
// marcações valem apenas para a sessão atual, pois ainda não há histórico
// persistido de comunicação (ver limitações documentadas).

type MessageStatus = "preparada" | "whatsapp_opened" | "manual_confirmed";

const STATUS_LABELS: Record<MessageStatus, string> = {
  preparada: "Preparada",
  whatsapp_opened: "WhatsApp aberto (envio não confirmado)",
  manual_confirmed: "Envio manual confirmado",
};

export function WhatsAppMessageDialog({
  title,
  recipientName,
  phone,
  initialMessage,
  category,
  context,
  onClose,
}: {
  title: string;
  recipientName: string;
  phone: string | null | undefined;
  initialMessage: string;
  category: CommunicationCategory;
  context?: string;
  onClose: () => void;
}) {
  const { notifyError, notifySuccess } = useToast();
  const [message, setMessage] = useState(initialMessage);
  const [status, setStatus] = useState<MessageStatus>("preparada");

  // O texto inicial vem das props e é aplicado na montagem. Como o diálogo é
  // remontado a cada destinatário (via key), não é preciso sincronizar por
  // efeito — o que também evita redefinir edições do usuário.

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const hasPhone = hasValidContactPhone(phone);
  const whatsappLink = useMemo(
    () => (hasPhone ? buildWhatsAppLink(phone, message.trim()) : null),
    [hasPhone, phone, message]
  );

  async function copyMessage() {
    const text = message.trim();
    if (!text) {
      notifyError("Escreva a mensagem antes de copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notifySuccess("Mensagem copiada.");
    } catch {
      notifyError("Não foi possível copiar a mensagem neste navegador.");
    }
  }

  function openWhatsApp() {
    if (!whatsappLink) {
      notifyError("O número desta cliente é inválido para o WhatsApp.");
      return;
    }
    window.open(whatsappLink, "_blank", "noopener,noreferrer");
    // Registra apenas que o link foi aberto — não é prova de envio.
    setStatus((current) =>
      current === "manual_confirmed" ? current : "whatsapp_opened"
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-message-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto my-2 w-full max-w-2xl rounded-2xl border border-[#e4ebe7] bg-[#fbfaf8] p-5 text-[#26352f] shadow-2xl sm:my-6 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-[#edf3ef] px-2.5 py-1 text-xs font-semibold text-[#50655b]">
              {COMMUNICATION_CATEGORY_LABELS[category]}
            </span>
            <h2
              id="whatsapp-message-title"
              className="mt-2 text-lg font-semibold text-[#30463c]"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-[#78867f]">
              Para{" "}
              <span className="font-medium text-[#52635b]">{recipientName}</span>
              {context ? ` · ${context}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#dce5e0] text-lg text-[#52635b] hover:bg-[#f4f7f5]"
          >
            ×
          </button>
        </div>

        <label
          htmlFor="whatsapp-message-text"
          className="mt-4 block text-sm font-semibold text-[#52635b]"
        >
          Mensagem (revise antes de enviar)
        </label>
        <textarea
          id="whatsapp-message-text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={6}
          className="mt-1 w-full rounded-xl border border-[#dce5e0] bg-white p-3 text-sm text-[#26352f] focus:border-[#9dc0ac] focus:outline-none"
        />

        {!hasPhone && (
          <p
            role="alert"
            className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
          >
            Esta cliente não tem um telefone/WhatsApp válido cadastrado. Você
            ainda pode copiar o texto, mas o link do WhatsApp fica indisponível.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openWhatsApp}
            disabled={!hasPhone}
            className="min-h-11 rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3c5749] disabled:opacity-40"
          >
            Abrir WhatsApp
          </button>
          <button
            type="button"
            onClick={copyMessage}
            className="min-h-11 rounded-xl border border-[#dce5e0] px-4 py-2 text-sm font-semibold text-[#30463c] hover:bg-[#f4f7f5]"
          >
            Copiar texto
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-[#e4ebe7] bg-white p-3">
          <p className="text-xs font-semibold text-[#78867f]">
            Estado desta mensagem
          </p>
          <p className="mt-1 text-sm font-medium text-[#30463c]">
            {STATUS_LABELS[status]}
          </p>
          <label className="mt-2 flex items-start gap-2 text-sm text-[#52635b]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={status === "manual_confirmed"}
              onChange={(event) =>
                setStatus(
                  event.target.checked ? "manual_confirmed" : "preparada"
                )
              }
            />
            <span>
              Confirmo que enviei manualmente pelo WhatsApp (declaração da
              profissional, sem comprovação técnica).
            </span>
          </label>
          <p className="mt-2 text-xs text-[#8a9891]">
            Estas marcações valem apenas nesta sessão e não formam um histórico
            permanente. Abrir o WhatsApp não significa que a cliente recebeu ou
            leu a mensagem.
          </p>
        </div>
      </div>
    </div>
  );
}
