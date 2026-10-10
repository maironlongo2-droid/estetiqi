"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "./toast";

// Caixa de entrada das mensagens do WhatsApp oficial (Cloud API).
//
// HONESTIDADE:
// - Só exibimos mensagens que a Meta realmente entregou ao webhook e que o
//   servidor conseguiu gravar. Nenhuma conversa é inventada.
// - Mensagens enviadas por wa.me (link manual) NÃO aparecem aqui: elas não
//   passam pela API oficial e o sistema não tem como confirmá-las.
// - Se a estrutura do banco ainda não existir, o servidor responde com
//   `ready = false` e aqui explicamos o motivo em vez de mostrar lista vazia
//   como se estivesse tudo certo.

type Conversation = {
  phone: string;
  clientId: string | null;
  clientName: string | null;
  lastBody: string | null;
  lastMessageType: string | null;
  lastAt: string;
  messageCount: number;
};

type ConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  status: string | null;
  body: string | null;
  messageType: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type ConversationsResponse = {
  error?: string;
  ready?: boolean;
  conversations?: Conversation[];
};

type MessagesResponse = {
  error?: string;
  ready?: boolean;
  messages?: ConversationMessage[];
};

type SendResponse = {
  error?: string;
  recorded?: boolean;
  providerMessageId?: string | null;
};

// Rótulos em português para os estados gravados no banco. Um estado desconhecido
// é mostrado como veio, sem inventar significado.
const OUTBOUND_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho (não enviada)",
  prepared: "Preparada (não enviada)",
  whatsapp_opened: "Aberta no WhatsApp (envio não confirmado)",
  queued: "Na fila da Meta",
  sent: "Enviada (aguardando entrega)",
  delivered: "Entregue",
  read: "Lida pela cliente",
  failed: "Falhou",
  cancelled: "Cancelada",
};

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  text: "Texto",
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contacts: "Contato",
  interactive: "Resposta interativa",
  button: "Resposta de botão",
  unknown: "Conteúdo não suportado",
};

function outboundStatusLabel(status: string | null) {
  if (!status) return "Enviada";
  return OUTBOUND_STATUS_LABELS[status] ?? status;
}

function messageTypeLabel(type: string | null) {
  if (!type) return "(sem texto)";
  return `(${MESSAGE_TYPE_LABELS[type] ?? type})`;
}

function formatMoment(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function displayPhone(phone: string) {
  return phone.startsWith("+") ? phone : `+${phone}`;
}

export function WhatsAppInbox({ connected }: { connected: boolean }) {
  const { notifyError, notifySuccess } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messagesReady, setMessagesReady] = useState<boolean | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendNotice, setSendNotice] = useState("");

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        "/api/communication/whatsapp/conversations"
      );
      const data = (await response
        .json()
        .catch(() => null)) as ConversationsResponse | null;
      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível carregar as conversas."
        );
      }
      setConversations(
        Array.isArray(data?.conversations) ? data.conversations : []
      );
      setReady(data?.ready !== false);
      setError("");
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar as conversas."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A chamada é adiada para fora do corpo síncrono do efeito (mesmo padrão
    // usado em clientes/page.tsx) para evitar renders em cascata.
    const timer = window.setTimeout(() => {
      void loadConversations();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadConversations]);

  const loadMessages = useCallback(async (phone: string) => {
    setMessagesLoading(true);
    setMessagesError("");
    try {
      const response = await fetch(
        `/api/communication/whatsapp/conversations/messages?phone=${encodeURIComponent(phone)}`
      );
      const data = (await response
        .json()
        .catch(() => null)) as MessagesResponse | null;
      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível carregar esta conversa."
        );
      }
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setMessagesReady(data?.ready !== false);
    } catch (loadError: unknown) {
      setMessages([]);
      setMessagesReady(null);
      setMessagesError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar esta conversa."
      );
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  function openConversation(conversation: Conversation) {
    setSelected(conversation);
    setDraft("");
    setSendNotice("");
    void loadMessages(conversation.phone);
  }

  async function sendMessage() {
    if (!selected) return;
    const body = draft.trim();
    if (!body) {
      notifyError("Escreva a mensagem antes de enviar.");
      return;
    }
    setSending(true);
    setSendNotice("");
    try {
      const response = await fetch("/api/communication/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selected.phone,
          body,
          clientId: selected.clientId ?? undefined,
        }),
      });
      const data = (await response
        .json()
        .catch(() => null)) as SendResponse | null;
      if (!response.ok) {
        notifyError(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível enviar pela API oficial."
        );
        return;
      }
      setDraft("");
      notifySuccess("A Meta aceitou a mensagem.");
      setSendNotice(
        data?.recorded === true
          ? "A Meta aceitou o envio e a mensagem foi registrada no histórico."
          : "A Meta aceitou o envio, mas o registro no histórico falhou. A mensagem SAIU mesmo assim."
      );
      await loadMessages(selected.phone);
      await loadConversations();
    } catch {
      notifyError("Não foi possível enviar pela API oficial.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#30463c]">
          Conversas no WhatsApp oficial
        </h2>
        <button
          type="button"
          onClick={() => void loadConversations()}
          disabled={loading}
          className="min-h-10 rounded-xl border border-[#dce5e0] px-3 py-1.5 text-sm font-semibold text-[#30463c] transition hover:bg-[#f4f7f5] disabled:opacity-50"
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>
      <p className="mt-1 text-sm text-[#78867f]">
        Mensagens que as clientes enviaram para o número oficial conectado. Só
        aparece o que a Meta realmente entregou ao sistema. Mensagens enviadas
        pelo link manual (wa.me) não passam pela API oficial e não são listadas
        aqui.
      </p>

      {!connected && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Número oficial não conectado.</p>
          <p className="mt-1">
            Sem um número conectado (aba “WhatsApp e configurações”), a Meta não
            entrega mensagens para a EstetiQI e o envio pela API oficial fica
            indisponível. O envio manual por wa.me continua funcionando nas outras
            abas.
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {ready === false && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">
            A caixa de entrada ainda não está ativa.
          </p>
          <p className="mt-1">
            O armazenamento das mensagens recebidas depende das migrations do
            banco (033_communication_messages.sql e
            036_inbound_whatsapp_messages.sql). Enquanto elas não forem
            aplicadas, nenhuma conversa pode ser exibida — e nenhuma é inventada.
          </p>
        </div>
      )}

      {ready !== false && !error && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div>
            {conversations.length === 0 ? (
              <p className="rounded-xl bg-[#fafcfb] p-4 text-sm text-[#78867f]">
                Nenhuma mensagem recebida até agora. Assim que uma cliente
                escrever para o número oficial, a conversa aparece aqui.
              </p>
            ) : (
              <ul className="divide-y divide-[#eef2ef]">
                {conversations.map((conversation) => {
                  const active = selected?.phone === conversation.phone;
                  return (
                    <li key={conversation.phone}>
                      <button
                        type="button"
                        onClick={() => openConversation(conversation)}
                        aria-pressed={active}
                        className={`w-full rounded-xl px-3 py-3 text-left transition ${
                          active ? "bg-[#edf3ef]" : "hover:bg-[#f4f7f5]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium text-[#30463c]">
                            {conversation.clientName ??
                              displayPhone(conversation.phone)}
                          </p>
                          <span className="shrink-0 text-xs text-[#8a9891]">
                            {formatMoment(conversation.lastAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-[#78867f]">
                          {conversation.lastBody ??
                            messageTypeLabel(conversation.lastMessageType)}
                        </p>
                        <p className="mt-1 text-xs text-[#8a9891]">
                          {conversation.messageCount} mensagem(ns) recebida(s)
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-[#e4ebe7] p-3 sm:p-4">
            {!selected ? (
              <p className="text-sm text-[#78867f]">
                Selecione uma conversa para ver as mensagens.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[#30463c]">
                    {selected.clientName ?? displayPhone(selected.phone)}
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadMessages(selected.phone)}
                    disabled={messagesLoading}
                    className="text-xs font-semibold text-[#52635b] underline disabled:opacity-50"
                  >
                    {messagesLoading ? "Carregando..." : "Atualizar conversa"}
                  </button>
                </div>

                {messagesError && (
                  <p
                    role="alert"
                    className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700"
                  >
                    {messagesError}
                  </p>
                )}

                {messagesReady === false && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    A estrutura do histórico ainda não está aplicada no banco:
                    esta conversa não pode ser exibida.
                  </p>
                )}

                {messagesLoading ? (
                  <p className="mt-3 text-sm text-[#8a9891]">
                    Carregando a conversa...
                  </p>
                ) : messages.length === 0 ? (
                  <p className="mt-3 text-sm text-[#78867f]">
                    Nenhuma mensagem registrada nesta conversa.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {messages.map((message) => (
                      <li
                        key={message.id}
                        className={
                          message.direction === "outbound"
                            ? "flex justify-end"
                            : "flex justify-start"
                        }
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm text-[#30463c] ${
                            message.direction === "outbound"
                              ? "bg-[#edf7ef]"
                              : "bg-[#f4f7f5]"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {message.body ??
                              messageTypeLabel(message.messageType)}
                          </p>
                          <p className="mt-1 text-[11px] text-[#78867f]">
                            {message.direction === "outbound"
                              ? `Você · ${outboundStatusLabel(message.status)}`
                              : "Cliente"}{" "}
                            · {formatMoment(message.createdAt)}
                          </p>
                          {message.errorMessage && (
                            <p className="mt-1 text-[11px] text-red-700">
                              Falha: {message.errorMessage}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Resposta pela API oficial. A Meta só aceita texto livre dentro
                    da janela de atendimento de 24h; fora dela é necessário um
                    modelo aprovado. O erro real da Meta é mostrado ao usuário. */}
                <div className="mt-4 border-t border-[#eef2ef] pt-3">
                  <label
                    htmlFor="whatsapp-inbox-reply"
                    className="text-xs font-semibold uppercase tracking-wide text-[#8a9891]"
                  >
                    Responder pela API oficial
                  </label>
                  <textarea
                    id="whatsapp-inbox-reply"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={3}
                    maxLength={4096}
                    disabled={!connected || sending}
                    placeholder="Escreva a resposta para a cliente..."
                    className="mt-2 w-full rounded-xl border border-[#dce5e0] bg-white px-3 py-2 text-sm text-[#30463c] outline-none focus:border-[#9dbfad] disabled:bg-[#f7faf8]"
                  />
                  <p className="mt-2 text-xs text-[#8a9891]">
                    A Meta aceita texto livre apenas enquanto a cliente falou com
                    você nas últimas 24 horas. Fora dessa janela, use um dos
                    modelos aprovados. Não envie promoções sem consentimento.
                  </p>
                  {!connected && (
                    <p className="mt-2 text-xs text-amber-800">
                      Conecte um número oficial na aba “WhatsApp e configurações”
                      para responder por aqui.
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={
                        !connected || sending || draft.trim().length === 0
                      }
                      className="min-h-11 rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3c5749] disabled:opacity-50"
                    >
                      {sending ? "Enviando..." : "Enviar pela API oficial"}
                    </button>
                  </div>
                  {sendNotice && (
                    <p
                      role="status"
                      className="mt-2 rounded-xl bg-[#f7faf8] p-3 text-sm text-[#52645b]"
                    >
                      {sendNotice}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}