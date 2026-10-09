"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  type SupportCategory,
} from "@/lib/validation/support";

type SupportRequestSummary = {
  id: string;
  category: SupportCategory;
  subject: string;
  status: string;
  created_at: string;
  support_messages: number;
  messages: number;
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  resolved: "Resolvida",
  closed: "Fechada",
};

export default function SuportePage() {
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [requests, setRequests] = useState<SupportRequestSummary[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  useEffect(() => {
    let active = true;

    fetch("/api/support/requests")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && Array.isArray(data?.requests)) {
          setRequests(data.requests as SupportRequestSummary[]);
        }
      })
      .catch(() => {
        // O histórico é informativo; uma falha não bloqueia o envio de novas
        // solicitações.
      })
      .finally(() => {
        if (active) setLoadingRequests(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Evita envios duplicados enquanto uma solicitação está em andamento.
    if (submitting) return;

    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();

    if (!category) {
      setSuccess("");
      setError("Selecione uma categoria.");
      return;
    }

    if (trimmedSubject.length < 3) {
      setSuccess("");
      setError("Descreva o assunto com pelo menos 3 caracteres.");
      return;
    }

    if (trimmedDescription.length < 10) {
      setSuccess("");
      setError("Descreva o que aconteceu com pelo menos 10 caracteres.");
      return;
    }

    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/support/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject: trimmedSubject,
          description: trimmedDescription,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível registrar a solicitação."
        );
      }

      // Sucesso somente depois da confirmação real do servidor.
      const created = data?.request;
      if (created) {
        setRequests((current) => [
          {
            ...(created as SupportRequestSummary),
            support_messages: 0,
            messages: 0,
          },
          ...current,
        ]);
      }
      setCategory("");
      setSubject("");
      setDescription("");
      setSuccess("Solicitação registrada com sucesso.");
    } catch (submitError) {
      // O conteúdo digitado é preservado para o usuário tentar novamente.
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível registrar a solicitação. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-main-min-h bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-3xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <header className="mb-7">
          <h1 className="text-3xl font-semibold tracking-tight text-[#30463c]">
            Estamos aqui para ajudar!
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#78867f]">
            O EstetiQI está em constante evolução, e queremos ouvir você. Este
            espaço foi criado para que você possa tirar dúvidas, relatar
            problemas e compartilhar sugestões para melhorar sua experiência com
            a plataforma.
          </p>
        </header>

        <section className="mb-6 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-[0_20px_60px_rgba(64,91,78,0.08)]">
          <h2 className="text-lg font-semibold text-[#30463c]">
            Como podemos ajudar?
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-[#e4ebe7] bg-[#f8faf9] p-4">
              <span className="text-2xl" aria-hidden="true">
                ❓
              </span>
              <h3 className="mt-2 text-sm font-semibold text-[#30463c]">
                Tenho uma dúvida
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#78867f]">
                Precisa de ajuda para utilizar algum recurso do EstetiQI? Conte
                o que você precisa.
              </p>
            </article>

            <article className="rounded-2xl border border-[#e4ebe7] bg-[#f8faf9] p-4">
              <span className="text-2xl" aria-hidden="true">
                💡
              </span>
              <h3 className="mt-2 text-sm font-semibold text-[#30463c]">
                Quero dar uma sugestão
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#78867f]">
                Sua opinião é importante. Compartilhe ideias e melhorias que
                gostaria de ver na plataforma.
              </p>
            </article>

            <article className="rounded-2xl border border-[#e4ebe7] bg-[#f8faf9] p-4">
              <span className="text-2xl" aria-hidden="true">
                🐛
              </span>
              <h3 className="mt-2 text-sm font-semibold text-[#30463c]">
                Encontrei um problema
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#78867f]">
                Algo não funcionou como deveria? Explique o que aconteceu para
                que possamos analisar.
              </p>
            </article>
          </div>
        </section>

        <section className="mb-6 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-[0_20px_60px_rgba(64,91,78,0.08)]">
          <h2 className="text-lg font-semibold text-[#30463c]">
            Contato direto
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#78867f]">
            Você também pode falar com a nossa equipe por e-mail:
          </p>
          <a
            href="mailto:suporte@estetiqi.com.br"
            className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-[#dfe9e3] px-4 py-2 text-sm font-medium text-[#496458] transition hover:bg-[#f4f7f5]"
          >
            suporte@estetiqi.com.br
          </a>
        </section>

        <section className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-[0_20px_60px_rgba(64,91,78,0.08)]">
          <h2 className="text-lg font-semibold text-[#30463c]">
            Enviar uma solicitação
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#78867f]">
            Descreva a sua dúvida, sugestão ou problema. Não inclua senhas, dados
            de cartão nem informações pessoais desnecessárias de terceiros.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            <label className="block" htmlFor="support-category">
              <span className="mb-2 block text-sm font-medium text-[#405149]">
                Categoria
              </span>
              <select
                id="support-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                required
                className="min-h-11 w-full rounded-xl border border-[#dfe9e3] bg-white px-4 py-3 outline-none focus:border-[#7a9f8d]"
              >
                <option value="" disabled>
                  Selecione uma categoria
                </option>
                {SUPPORT_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {SUPPORT_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block" htmlFor="support-subject">
              <span className="mb-2 block text-sm font-medium text-[#405149]">
                Assunto
              </span>
              <input
                id="support-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
                minLength={3}
                maxLength={160}
                placeholder="Resuma o seu pedido"
                className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
              />
            </label>

            <label className="block" htmlFor="support-description">
              <span className="mb-2 block text-sm font-medium text-[#405149]">
                Descrição
              </span>
              <textarea
                id="support-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                minLength={10}
                maxLength={5000}
                rows={6}
                placeholder="Conte o que aconteceu, onde e quando."
                className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
              />
              <span className="mt-1 block text-xs text-[#8a9891]">
                Evite incluir informações pessoais de terceiros que não sejam
                necessárias.
              </span>
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
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
              disabled={submitting}
              className="min-h-11 w-full rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#263a31] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {submitting ? "Enviando..." : "Enviar solicitação"}
            </button>
          </form>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-[#e4ebe7] bg-white">
          <div className="border-b border-[#e4ebe7] px-6 py-4">
            <h2 className="text-lg font-semibold text-[#30463c]">
              Acompanhe suas solicitações
            </h2>
            <p className="mt-1 text-sm text-[#78867f]">
              Depois de enviar uma mensagem, você poderá acompanhar o andamento
              da solicitação e consultar nossas respostas diretamente nesta
              área, sem precisar procurar um contato externo.
            </p>
          </div>

          {loadingRequests ? (
            <p className="p-6 text-sm text-[#78867f]">
              Carregando solicitações...
            </p>
          ) : requests.length === 0 ? (
            <p className="p-6 text-sm text-[#78867f]">
              Você ainda não enviou nenhuma solicitação.
            </p>
          ) : (
            <ul className="divide-y divide-[#e4ebe7]">
              {requests.map((request) => (
                <li key={request.id}>
                  <Link
                    href={`/app/suporte/${request.id}`}
                    className="flex flex-col gap-1 p-4 transition hover:bg-[#f4f7f5] sm:flex-row sm:items-center sm:justify-between sm:p-5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#30463c]">
                        {request.subject}
                      </p>
                      <p className="mt-1 text-xs text-[#8a9891]">
                        {SUPPORT_CATEGORY_LABELS[request.category] ??
                          "Solicitação"}
                        {" · "}
                        {new Date(request.created_at).toLocaleDateString(
                          "pt-BR"
                        )}
                      </p>
                      {request.support_messages > 0 && (
                        <p className="mt-1 text-xs font-medium text-[#477152]">
                          {request.support_messages === 1
                            ? "1 resposta do suporte"
                            : `${request.support_messages} respostas do suporte`}
                        </p>
                      )}
                    </div>
                    <span className="mt-1 inline-flex w-fit shrink-0 rounded-full bg-[#edf3ef] px-3 py-1 text-xs font-medium text-[#50655b] sm:mt-0">
                      {STATUS_LABELS[request.status] ?? request.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="mt-6 text-center text-xs leading-6 text-[#8a9891]">
          Sua experiência importa. Estamos construindo o EstetiQI para ajudar
          você a organizar melhor seu negócio e atender seus clientes.
        </p>
      </div>
    </main>
  );
}

