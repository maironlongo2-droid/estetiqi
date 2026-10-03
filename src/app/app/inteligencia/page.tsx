"use client";

import { useEffect, useState } from "react";

type Opportunity = {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  data: {
    suggestedAction?: string | null;
  };
};

type Metrics = {
  revenue: number;
  previousRevenue: number;
  revenueChange: number | null;
  payments: number;
  payingClients: number;
  ticketAverage: number;
  professionals: Array<{
    professionalName: string;
    appointments: number;
    revenue: number;
    ticketAverage: number;
  }>;
};

export default function InteligenciaPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [creatingAction, setCreatingAction] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, { id: string; status: string }>>({});

  async function load() {
    const [metricsResponse, opportunitiesResponse] = await Promise.all([
      fetch("/api/analytics"),
      fetch("/api/ai/opportunities"),
    ]);

    if (metricsResponse.ok) {
      setMetrics(await metricsResponse.json());
    }

    if (opportunitiesResponse.ok) {
      setOpportunities(await opportunitiesResponse.json());
    }

    setLoading(false);
  }

  async function generateOpportunities() {
    setGenerating(true);

    const response = await fetch("/api/ai/opportunities", {
      method: "POST",
    });

    if (response.ok) {
      await load();
    }

    setGenerating(false);
  }

  async function createAction(opportunity: Opportunity) {
    setCreatingAction(opportunity.id);

    const response = await fetch("/api/ai/actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        opportunityId: opportunity.id,
        type: "recommended_action",
        payload: {
          suggestedAction: opportunity.data?.suggestedAction ?? null,
        },
      }),
    });

    if (response.ok) {
      const action = await response.json();

      setActions((current) => ({
        ...current,
        [opportunity.id]: {
          id: action.id,
          status: action.status,
        },
      }));
    }

    setCreatingAction(null);
  }

  async function processAction(
    opportunityId: string,
    actionId: string,
    status: "approved" | "cancelled"
  ) {
    setProcessingAction(actionId);

    const response = await fetch(`/api/ai/actions/${actionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    if (response.ok) {
      const action = await response.json();

      setActions((current) => ({
        ...current,
        [opportunityId]: {
          id: action.id,
          status: action.status,
        },
      }));
    }

    setProcessingAction(null);
  }

  useEffect(() => {
    load();
  }, []);

  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  if (loading) {
    return (
      <main className="p-6">
        <p className="text-sm text-gray-500">Carregando inteligência...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fbfaf8] p-6 text-[#26352f]">
      <header>
        <h1 className="text-2xl font-semibold text-[#30463c]">Inteligência</h1>
        <p className="mt-1 text-sm text-[#78867f]">
          O que merece atenção no negócio agora.
        </p>
      </header>

      {metrics && (
        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-sm text-gray-500">Receita do mês</p>
            <p className="mt-2 text-xl font-semibold">
              {money(metrics.revenue)}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-sm text-gray-500">Ticket médio</p>
            <p className="mt-2 text-xl font-semibold">
              {money(metrics.ticketAverage)}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-sm text-gray-500">Clientes pagantes</p>
            <p className="mt-2 text-xl font-semibold">
              {metrics.payingClients}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-sm text-gray-500">Variação da receita</p>
            <p className="mt-2 text-xl font-semibold">
              {metrics.revenueChange === null
                ? "—"
                : `${metrics.revenueChange.toFixed(1)}%`}
            </p>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Oportunidades</h2>
            <p className="mt-1 text-sm text-[#78867f]">
              Recomendações geradas a partir dos dados do negócio.
            </p>
          </div>

          <button
            onClick={generateOpportunities}
            disabled={generating}
            className="rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {generating ? "Analisando..." : "Analisar agora"}
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {opportunities.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nenhuma oportunidade identificada ainda.
            </p>
          ) : (
            opportunities.map((opportunity) => (
              <article
                key={opportunity.id}
                className="rounded-xl border border-[#e4ebe7] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium">{opportunity.title}</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {opportunity.description}
                    </p>
                  </div>

                  <span className="rounded-full bg-[#edf3ef] px-2 py-1 text-xs text-[#50655b]">
                    {opportunity.priority}
                  </span>
                </div>

                {opportunity.data?.suggestedAction && (
                  <div className="mt-3 border-t pt-3">
                    <p className="text-xs font-medium uppercase text-gray-500">
                      Próxima ação
                    </p>
                    <p className="mt-1 text-sm">
                      {opportunity.data.suggestedAction}
                    </p>

                    <div className="mt-4">
                      {!actions[opportunity.id] ? (
                        <button
                          onClick={() => createAction(opportunity)}
                          disabled={creatingAction === opportunity.id}
                          className="rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {creatingAction === opportunity.id
                            ? "Criando..."
                            : "Criar ação"}
                        </button>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">
                            {actions[opportunity.id].status === "pending_approval"
                              ? "Pendente"
                              : actions[opportunity.id].status === "approved"
                                ? "Aprovada"
                                : "Cancelada"}
                          </span>

                          {actions[opportunity.id].status === "pending_approval" && (
                            <>
                              <button
                                onClick={() =>
                                  processAction(
                                    opportunity.id,
                                    actions[opportunity.id].id,
                                    "approved"
                                  )
                                }
                                disabled={
                                  processingAction === actions[opportunity.id].id
                                }
                                className="rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                Aprovar
                              </button>

                              <button
                                onClick={() =>
                                  processAction(
                                    opportunity.id,
                                    actions[opportunity.id].id,
                                    "cancelled"
                                  )
                                }
                                disabled={
                                  processingAction === actions[opportunity.id].id
                                }
                                className="rounded-xl border border-[#dce5e0] px-4 py-2 text-sm disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </section>

      {metrics && metrics.professionals.length > 0 && (
        <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
          <h2 className="font-semibold">Profissionais</h2>

          <div className="mt-4 divide-y">
            {metrics.professionals.map((professional) => (
              <div
                key={professional.professionalName}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-medium">
                    {professional.professionalName}
                  </p>
                  <p className="text-sm text-gray-500">
                    {professional.appointments} atendimentos
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-medium">
                    {money(professional.revenue)}
                  </p>
                  <p className="text-xs text-gray-500">
                    ticket {money(professional.ticketAverage)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
