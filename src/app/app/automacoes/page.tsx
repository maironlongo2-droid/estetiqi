"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useToast } from "../toast";

type Automation = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type InactiveClient = {
  id: string;
  name: string;
  last_appointment_at: string;
  inactive_days: number;
};

const automationTypes: Record<string, {
  label: string;
  when: string;
  benefit: string;
  available: boolean;
}> = {
  inactive_client: {
    label: "Clientes sem voltar",
    when: "Quando você atualiza a lista de clientes sem retorno.",
    benefit: "Ajuda a encontrar quem pode receber uma mensagem de reativação.",
    available: true,
  },
  birthday: {
    label: "Aniversários",
    when: "A consulta de aniversários ainda não está disponível.",
    benefit: "Este acompanhamento ainda não gera uma lista ou oportunidade.",
    available: false,
  },
  procedure_return: {
    label: "Clientes que podem voltar",
    when: "Quando você atualiza as oportunidades de retorno na página inicial.",
    benefit: "Considera o histórico, o prazo de retorno e faltas ou cancelamentos.",
    available: true,
  },
};

const businessActions = [
  {
    title: "Lembrar clientes que estão há muito tempo sem voltar",
    description:
      "Veja clientes sem atendimento concluído há mais tempo que o prazo escolhido.",
    when: "Quando você clicar em Atualizar clientes sem retorno.",
    benefit: "Ajuda a escolher quem pode receber uma mensagem de reativação.",
    setup: "Não. Escolha o prazo na própria consulta.",
    href: "#inactive-clients",
    linkLabel: "Ver clientes sem retorno",
  },
  {
    title: "Encontrar clientes que podem voltar",
    description:
      "Encontre clientes cujo histórico indica que pode estar na hora de um novo atendimento.",
    when: "Quando você atualizar as oportunidades de retorno na página inicial.",
    benefit: "Mostra quem pode estar pronto para agendar novamente.",
    setup: "Não. O EstetiQI considera os dados de atendimentos disponíveis.",
    href: "/app#return-opportunities",
    linkLabel: "Ver oportunidades de retorno",
  },
  {
    title: "Ajudar a recuperar clientes que faltaram",
    description:
      "A consulta de retorno também considera faltas e cancelamentos recentes.",
    when: "Junto com a atualização das oportunidades de retorno.",
    benefit: "Ajuda a oferecer uma nova data a quem não conseguiu comparecer.",
    setup: "Não. O EstetiQI usa as faltas e os cancelamentos registrados.",
    href: "/app#return-opportunities",
    linkLabel: "Ver oportunidades de retorno",
  },
  {
    title: "Lembrar clientes de continuar o tratamento",
    description:
      "Considera o intervalo de retorno do procedimento ou a frequência anterior.",
    when: "Quando houver histórico suficiente e não existir horário futuro marcado.",
    benefit: "Ajuda a manter a continuidade do atendimento no momento adequado.",
    setup:
      "Não. O prazo do procedimento ajuda; com histórico suficiente, o sistema usa a frequência anterior.",
    href: "/app#return-opportunities",
    linkLabel: "Ver oportunidades de retorno",
  },
  {
    title: "Identificar oportunidades do negócio",
    description:
      "A Inteligência analisa os dados disponíveis para destacar pontos que merecem atenção.",
    when: "Quando você clicar em Analisar agora na página Inteligência.",
    benefit: "Transforma informações do negócio em sugestões de próximas ações.",
    setup: "Não. Basta pedir uma análise na área Inteligência.",
    href: "/app/inteligencia",
    linkLabel: "Abrir Inteligência",
  },
];

export default function AutomacoesPage() {
  const { notifyError } = useToast();
  const [error, setError] = useState("");
  const [inactiveDays, setInactiveDays] = useState("60");
  const [inactiveClients, setInactiveClients] = useState<InactiveClient[]>([]);
  const [inactiveLoading, setInactiveLoading] = useState(true);

  useEffect(() => {
    let current = true;

    fetch("/api/ai/inactive-clients?days=60")
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar clientes inativos.");
        return response.json();
      })
      .then((data) => {
        if (current) setInactiveClients(data.clients ?? []);
      })
      .catch((loadError: unknown) => {
        if (current) {
          notifyError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar clientes inativos."
          );
        }
      })
      .finally(() => {
        if (current) setInactiveLoading(false);
      });

    return () => {
      current = false;
    };
  }, [notifyError]);

  async function loadInactiveClients() {
    setError("");
    setInactiveLoading(true);
    try {
      const response = await fetch(
        `/api/ai/inactive-clients?days=${inactiveDays}`
      );
      if (!response.ok) {
        setError("Não foi possível atualizar a lista de clientes sem retorno.");
        return;
      }
      const data = await response.json();
      setInactiveClients(data.clients ?? []);
    } catch {
      setError("Não foi possível atualizar a lista. Tente novamente.");
    } finally {
      setInactiveLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-73px)] bg-[#fbfaf8] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7">
          <h1 className="text-3xl font-semibold tracking-tight text-[#30463c]">
            Automações
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#78867f]">
            Consulte ações prontas para identificar clientes que podem precisar
            de atenção e acessar oportunidades já disponíveis no EstetiQI.
          </p>
        </header>

        <section aria-labelledby="business-actions-title" className="mb-8">
          <div className="mb-4">
            <h2 id="business-actions-title" className="text-xl font-semibold text-[#30463c]">
              O que você pode fazer
            </h2>
            <p className="mt-1 text-sm text-[#78867f]">
              As consultas são feitas por você. Nenhuma mensagem é enviada
              automaticamente.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {businessActions.map((action) => (
              <article
                key={action.title}
                className="flex min-w-0 flex-col rounded-2xl border border-[#dfe9e3] bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold leading-6 text-[#30463c]">
                    {action.title}
                  </h3>
                  <span className="shrink-0 rounded-full bg-[#edf3ef] px-2.5 py-1 text-xs font-medium text-[#50655b]">
                    Consulta manual
                  </span>
                </div>
                <p className="mt-3 text-sm leading-5 text-[#66756d]">
                  {action.description}
                </p>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="font-medium text-[#52635b]">Quando acontece</dt>
                    <dd className="mt-1 leading-5 text-[#78867f]">{action.when}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[#52635b]">Como ajuda</dt>
                    <dd className="mt-1 leading-5 text-[#78867f]">{action.benefit}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[#52635b]">Precisa configurar?</dt>
                    <dd className="mt-1 leading-5 text-[#78867f]">{action.setup}</dd>
                  </div>
                </dl>
                <Link
                  href={action.href}
                  className="mt-5 inline-flex min-h-10 items-center justify-center rounded-xl border border-[#dce5e0] px-4 py-2 text-center text-sm font-semibold text-[#30463c] transition hover:bg-[#f4f7f5]"
                >
                  {action.linkLabel}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section id="inactive-clients" className="mb-8 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
          {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#30463c]">
                Clientes sem voltar
              </h2>
              <p className="mt-1 text-sm text-[#78867f]">
                Clientes sem atendimento concluído dentro do período escolhido.
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
              <label className="text-sm text-[#52635b]">
                Considerar sem retorno após
                <select
                  value={inactiveDays}
                  onChange={(event) => setInactiveDays(event.target.value)}
                  className="mt-1 block rounded-xl border border-[#dfe9e3] px-3 py-2 text-sm"
                >
                  <option value="30">30 dias</option>
                  <option value="45">45 dias</option>
                  <option value="60">60 dias</option>
                  <option value="90">90 dias</option>
                  <option value="120">120 dias</option>
                </select>
              </label>

              <button
                type="button"
                onClick={loadInactiveClients}
                disabled={inactiveLoading}
                className="rounded-xl bg-[#527765] px-4 py-2 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-60"
              >
                {inactiveLoading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-[#f5f8f6] p-5">
            <div className="text-3xl font-semibold text-[#30463c]">
              {inactiveLoading ? "..." : inactiveClients.length}
            </div>
            <div className="text-sm text-[#78867f]">
              {inactiveClients.length === 1 ? "cliente encontrado" : "clientes encontrados"}
            </div>
          </div>

          {inactiveClients.length > 0 && (
            <div className="mt-5 space-y-3">
              {inactiveClients.map((client) => (
                <div
                  key={client.id}
                  className="flex flex-col gap-2 rounded-2xl border border-[#e5ebe7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium text-[#30463c]">
                      {client.name}
                    </div>
                    <div className="text-sm text-[#78867f]">
                      Último atendimento:{" "}
                      {new Date(client.last_appointment_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold text-[#527765]">
                      {client.inactive_days} dias
                    </div>
                    <div className="text-xs text-[#78867f]">
                      sem retornar
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!inactiveLoading && inactiveClients.length === 0 && (
            <p className="mt-5 text-sm text-[#78867f]">
              Nenhum cliente encontrado nesse período.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
