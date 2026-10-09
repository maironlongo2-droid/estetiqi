"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_EDITABLE_STATUSES,
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_STATUS_LABELS,
  type SupportCategory,
} from "@/lib/validation/support";

type AdminTicket = {
  id: string;
  category: SupportCategory;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  organization_name: string;
  user_name: string | null;
  user_email: string;
  support_messages: number;
  customer_messages: number;
};

type TicketMessage = {
  id: string;
  author_type: string;
  author_email: string | null;
  body: string;
  created_at: string;
};

type TicketDetail = {
  request: {
    id: string;
    category: SupportCategory;
    subject: string;
    description: string;
    status: string;
    created_at: string;
    updated_at: string;
    organization_name: string;
    user_name: string | null;
    user_email: string;
  };
  messages: TicketMessage[];
};

type EditableStatus = (typeof SUPPORT_EDITABLE_STATUSES)[number];

// Cores do selo de situação, reaproveitando a paleta das demais telas.
const STATUS_STYLES: Record<string, string> = {
  open: "bg-[#fdf3e7] text-[#8a5a1f]",
  in_progress: "bg-[#e8eefb] text-[#2f4f8a]",
  resolved: "bg-[#edf7ef] text-[#477152]",
  closed: "bg-[#f4f7f5] text-[#66756d]",
};

function statusLabel(status: string) {
  return SUPPORT_STATUS_LABELS[status] ?? status;
}

function editableStatus(status: string): EditableStatus {
  return (SUPPORT_EDITABLE_STATUSES as readonly string[]).includes(status)
    ? (status as EditableStatus)
    : "open";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
export function SupportAdmin() {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/support/requests");
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível carregar as solicitações."
        );
      }

      setTickets(Array.isArray(data?.requests) ? data.requests : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar as solicitações."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError("");

    try {
      const response = await fetch(`/api/admin/support/requests/${id}`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível carregar a conversa."
        );
      }

      setDetail({ request: data.request, messages: data.messages ?? [] });
    } catch (loadError) {
      setDetail(null);
      setDetailError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar a conversa."
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Adia a chamada para fora do corpo síncrono do efeito (evita setState
    // sincrono no efeito) e ignora a resposta se o componente desmontar.
    void Promise.resolve().then(() => {
      if (active) return loadTickets();
      return undefined;
    });
    return () => {
      active = false;
    };
  }, [loadTickets]);

  function openTicket(id: string) {
    setSelectedId(id);
    setDetail(null);
    setReply("");
    setActionError("");
    void loadDetail(id);
  }

  async function changeStatus(status: string) {
    if (!selectedId || savingStatus) return;
    setSavingStatus(true);
    setActionError("");

    try {
      const response = await fetch(`/api/admin/support/requests/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível alterar a situação."
        );
      }

      const nextStatus = data?.request?.status ?? status;
      setDetail((current) =>
        current
          ? { ...current, request: { ...current.request, status: nextStatus } }
          : current
      );
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === selectedId ? { ...ticket, status: nextStatus } : ticket
        )
      );
    } catch (statusError) {
      setActionError(
        statusError instanceof Error
          ? statusError.message
          : "Não foi possível alterar a situação."
      );
    } finally {
      setSavingStatus(false);
    }
  }

  async function sendReply() {
    if (!selectedId || sending) return;
    const body = reply.trim();

    if (body.length === 0) {
      setActionError("Escreva uma resposta antes de enviar.");
      return;
    }

    setSending(true);
    setActionError("");

    try {
      const response = await fetch(
        `/api/admin/support/requests/${selectedId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        }
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível enviar a resposta."
        );
      }

      setReply("");
      await loadDetail(selectedId);
      void loadTickets();
    } catch (sendError) {
      setActionError(
        sendError instanceof Error
          ? sendError.message
          : "Não foi possível enviar a resposta."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="app-min-h min-h-screen bg-[#fbfaf8] text-[#26352f]">
      <header className="border-b border-[#e4ebe7] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-semibold text-[#30463c]">
              Central de suporte EstetiQi
            </h1>
            <p className="text-xs text-[#8a9891]">
              Solicitações de todas as organizações clientes.
            </p>
          </div>
          <Link
            href="/app"
            className="rounded-lg border border-[#dfe9e3] px-4 py-2 text-sm font-medium text-[#50655b] transition hover:bg-[#f4f7f5]"
          >
            Voltar ao app
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={() => void loadTickets()}
              className="mt-4 min-h-11 rounded-xl bg-[#30463c] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#263a31]"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
            <section
              className={`overflow-hidden rounded-3xl border border-[#e4ebe7] bg-white ${
                selectedId ? "hidden lg:block" : ""
              }`}
            >
              <div className="border-b border-[#e4ebe7] px-5 py-4">
                <h2 className="text-base font-semibold text-[#30463c]">
                  Solicitações
                </h2>
                <p className="mt-1 text-xs text-[#78867f]">
                  {loading
                    ? "Carregando..."
                    : `${tickets.length} solicitação(ões)`}
                </p>
              </div>

              {loading ? (
                <p className="p-5 text-sm text-[#78867f]">
                  Carregando solicitações...
                </p>
              ) : tickets.length === 0 ? (
                <p className="p-5 text-sm text-[#78867f]">
                  Nenhuma solicitação de suporte registrada até agora.
                </p>
              ) : (
                <ul className="divide-y divide-[#e4ebe7]">
                  {tickets.map((ticket) => (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        onClick={() => openTicket(ticket.id)}
                        className={`flex w-full flex-col gap-1 p-4 text-left transition hover:bg-[#f4f7f5] ${
                          selectedId === ticket.id ? "bg-[#edf3ef]" : ""
                        }`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0 break-words font-medium text-[#30463c]">
                            {ticket.subject}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              STATUS_STYLES[ticket.status] ?? STATUS_STYLES.closed
                            }`}
                          >
                            {statusLabel(ticket.status)}
                          </span>
                        </span>
                        <span className="truncate text-xs text-[#66756d]">
                          {ticket.organization_name} · {ticket.user_email}
                        </span>
                        <span className="text-[11px] text-[#8a9891]">
                          {SUPPORT_CATEGORY_LABELS[ticket.category] ?? "—"}
                          {" · "}
                          {formatDateTime(ticket.updated_at)}
                          {ticket.support_messages > 0
                            ? ` · ${ticket.support_messages} resposta(s) do suporte`
                            : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={selectedId ? "" : "hidden lg:block"}>
              {!selectedId ? (
                <div className="flex min-h-64 items-center justify-center rounded-3xl border border-dashed border-[#dfe9e3] bg-white p-8 text-center text-sm text-[#78867f]">
                  Selecione uma solicitação para ver a conversa completa e
                  responder.
                </div>
              ) : detailLoading ? (
                <p className="rounded-3xl border border-[#e4ebe7] bg-white p-6 text-sm text-[#78867f]">
                  Carregando conversa...
                </p>
              ) : detailError ? (
                <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                  <p role="alert">{detailError}</p>
                  <button
                    type="button"
                    onClick={() => selectedId && void loadDetail(selectedId)}
                    className="mt-4 min-h-11 rounded-xl bg-[#30463c] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#263a31]"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : detail ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-sm font-medium text-[#527765] lg:hidden"
                  >
                    ← Voltar para a lista
                  </button>

                  <div className="rounded-3xl border border-[#e4ebe7] bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words text-lg font-semibold text-[#30463c]">
                          {detail.request.subject}
                        </h2>
                        <p className="mt-1 break-words text-xs text-[#78867f]">
                          {detail.request.organization_name} ·{" "}
                          {detail.request.user_name ?? "—"} (
                          {detail.request.user_email})
                        </p>
                        <p className="mt-1 text-xs text-[#8a9891]">
                          {SUPPORT_CATEGORY_LABELS[detail.request.category] ??
                            "—"}{" "}
                          · Aberta em{" "}
                          {formatDateTime(detail.request.created_at)}
                        </p>
                      </div>

                      <label className="block text-xs font-medium text-[#405149]">
                        <span className="mb-1 block">Situação</span>
                        <select
                          value={editableStatus(detail.request.status)}
                          onChange={(event) =>
                            void changeStatus(event.target.value)
                          }
                          disabled={savingStatus}
                          className="min-h-11 rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm text-[#30463c] disabled:opacity-60"
                        >
                          {SUPPORT_EDITABLE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {statusLabel(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <article className="rounded-2xl border border-[#dfe9e3] bg-white p-4">
                      <header className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#30463c]">
                          Cliente
                        </span>
                        <time className="text-xs text-[#8a9891]">
                          {formatDateTime(detail.request.created_at)}
                        </time>
                      </header>
                      <p className="whitespace-pre-wrap break-words text-sm text-[#405149]">
                        {detail.request.description}
                      </p>
                    </article>

                    {detail.messages.map((message) => (
                      <article
                        key={message.id}
                        className={`rounded-2xl border p-4 ${
                          message.author_type === "support"
                            ? "border-[#cfe3d6] bg-[#f4f9f5]"
                            : "border-[#dfe9e3] bg-white"
                        }`}
                      >
                        <header className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-[#30463c]">
                            {message.author_type === "support"
                              ? "Suporte EstetiQi"
                              : "Cliente"}
                          </span>
                          <time className="text-xs text-[#8a9891]">
                            {formatDateTime(message.created_at)}
                          </time>
                        </header>
                        <p className="whitespace-pre-wrap break-words text-sm text-[#405149]">
                          {message.body}
                        </p>
                      </article>
                    ))}
                  </div>

                  <div className="rounded-3xl border border-[#e4ebe7] bg-white p-5">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[#405149]">
                        Responder à cliente
                      </span>
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        rows={4}
                        maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
                        placeholder="Escreva a resposta que aparecerá para a cliente dentro do EstetiQi."
                        className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
                      />
                    </label>

                    {actionError && (
                      <p
                        role="alert"
                        className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"
                      >
                        {actionError}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => void sendReply()}
                      disabled={sending}
                      className="mt-3 min-h-11 w-full rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#263a31] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {sending ? "Enviando..." : "Enviar resposta"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
