"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_STATUS_LABELS,
  type SupportCategory,
} from "@/lib/validation/support";

type SupportRequest = {
  id: string;
  category: SupportCategory;
  subject: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type SupportMessage = {
  id: string;
  author_type: string;
  body: string;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-[#fdf3e7] text-[#8a5a1f]",
  in_progress: "bg-[#e8eefb] text-[#2f4f8a]",
  resolved: "bg-[#edf7ef] text-[#477152]",
  closed: "bg-[#f4f7f5] text-[#66756d]",
};

function statusLabel(status: string) {
  return SUPPORT_STATUS_LABELS[status] ?? status;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function SuporteSolicitacaoPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? "");

  const [request, setRequest] = useState<SupportRequest | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/support/requests/${id}`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível carregar a solicitação."
        );
      }

      setRequest(data.request as SupportRequest);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar a solicitação."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    // Adia a chamada para fora do corpo síncrono do efeito (evita setState
    // sincrono no efeito) e ignora a resposta se o componente desmontar.
    void Promise.resolve().then(() => {
      if (active) return load();
      return undefined;
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    const body = reply.trim();

    if (body.length === 0) {
      setSuccess("");
      setSendError("Escreva uma mensagem antes de enviar.");
      return;
    }

    setSending(true);
    setSendError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/support/requests/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível enviar a mensagem."
        );
      }

      setReply("");
      if (data?.message) {
        setMessages((current) => [...current, data.message as SupportMessage]);
      }
      setSuccess("Mensagem enviada.");
    } catch (submitError) {
      setSendError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível enviar a mensagem."
      );
    } finally {
      setSending(false);
    }
  }

  const canReply =
    request?.status === "open" || request?.status === "in_progress";

  return (
    <main className="app-main-min-h bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-3xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <header className="mb-6">
          <Link
            href="/app/suporte"
            className="text-sm font-medium text-[#527765] hover:underline"
          >
            ← Voltar para Ajuda e suporte
          </Link>
        </header>

        {loading ? (
          <p className="text-sm text-[#78867f]">Carregando solicitação...</p>
        ) : error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            <p role="alert">{error}</p>
            <Link
              href="/app/suporte"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#30463c] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#263a31]"
            >
              Voltar
            </Link>
          </div>
        ) : request ? (
          <div className="space-y-5">
            <div className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-[0_20px_60px_rgba(64,91,78,0.08)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="break-words text-2xl font-semibold tracking-tight text-[#30463c]">
                    {request.subject}
                  </h1>
                  <p className="mt-1 text-xs text-[#8a9891]">
                    {SUPPORT_CATEGORY_LABELS[request.category] ?? "Solicitação"}
                    {" · "}
                    {formatDateTime(request.created_at)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    STATUS_STYLES[request.status] ?? STATUS_STYLES.closed
                  }`}
                >
                  {statusLabel(request.status)}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                <article className="rounded-2xl border border-[#dfe9e3] bg-white p-4">
                  <header className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#30463c]">
                      Você
                    </span>
                    <time className="text-xs text-[#8a9891]">
                      {formatDateTime(request.created_at)}
                    </time>
                  </header>
                  <p className="whitespace-pre-wrap break-words text-sm text-[#405149]">
                    {request.description}
                  </p>
                </article>

                {messages.map((message) => (
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
                          : "Você"}
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

                {messages.length === 0 && (
                  <p className="text-sm text-[#78867f]">
                    Ainda não há respostas da equipe de suporte.
                  </p>
                )}
              </div>
            </div>

            {canReply ? (
              <section className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-[0_20px_60px_rgba(64,91,78,0.08)]">
                <h2 className="text-lg font-semibold text-[#30463c]">
                  Responder
                </h2>
                <p className="mt-1 text-sm text-[#78867f]">
                  Sua mensagem continua na mesma solicitação.
                </p>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <label className="block" htmlFor="support-reply">
                    <span className="mb-2 block text-sm font-medium text-[#405149]">
                      Mensagem
                    </span>
                    <textarea
                      id="support-reply"
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      rows={4}
                      maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
                      placeholder="Escreva a sua mensagem"
                      className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
                    />
                  </label>

                  {sendError && (
                    <p
                      role="alert"
                      className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
                    >
                      {sendError}
                    </p>
                  )}

                  {success && (
                    <p
                      role="status"
                      className="rounded-xl bg-[#edf7ef] p-3 text-sm text-[#477152]"
                    >
                      {success}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={sending}
                    className="min-h-11 w-full rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#263a31] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {sending ? "Enviando..." : "Enviar mensagem"}
                  </button>
                </form>
              </section>
            ) : (
              <p className="rounded-3xl border border-[#e4ebe7] bg-white p-5 text-sm text-[#78867f]">
                Esta solicitação está{" "}
                {request.status === "resolved" ? "resolvida" : "encerrada"} e não
                aceita novas mensagens. Se precisar de mais ajuda, envie uma nova
                solicitação em Ajuda e suporte.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
