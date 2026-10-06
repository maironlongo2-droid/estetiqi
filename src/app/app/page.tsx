"use client";

import { useEffect, useState } from "react";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
};

type Analytics = {
  revenue?: {
    currentMonth?: number;
    previousMonth?: number;
    changePercent?: number;
  };
  ticketAverage?: number;
  payingClients?: number;
  appointments?: {
    total?: number;
    completed?: number;
    cancelled?: number;
    noShow?: number;
  };
  professionals?: Array<{
    name: string;
    revenue?: number;
    appointments?: number;
  }>;
};

function money(value = 0) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function AppPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then((response) => response.json()),
      fetch("/api/analytics").then((response) => response.json()),
    ])
      .then(([clientsData, analyticsData]) => {
        setClients(clientsData.clients || []);
        setAnalytics(analyticsData);
      })
      .finally(() => setLoading(false));
  }, []);

  const revenue = analytics?.revenue?.currentMonth ?? 0;
  const ticket = analytics?.ticketAverage ?? 0;
  const payingClients = analytics?.payingClients ?? 0;
  const appointments = analytics?.appointments?.total ?? 0;
  const completed = analytics?.appointments?.completed ?? 0;
  const change = analytics?.revenue?.changePercent ?? 0;

  return (
    <main className="min-h-screen bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-[#78867f]">
            Visão geral do negócio
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-[#78867f]">
            Acompanhe os principais números da sua operação.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Receita do mês"
            value={money(revenue)}
            detail={`${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs. mês anterior`}
          />

          <MetricCard
            label="Ticket médio"
            value={money(ticket)}
            detail="Por cliente pagante"
          />

          <MetricCard
            label="Clientes pagantes"
            value={String(payingClients)}
            detail={`${clients.length} clientes no CRM`}
          />

          <MetricCard
            label="Agendamentos"
            value={String(appointments)}
            detail={`${completed} concluídos`}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-[#e4ebe7] bg-white">
            <div className="border-b border-[#e4ebe7] p-6">
              <h2 className="text-lg font-semibold">Resumo da operação</h2>
              <p className="mt-1 text-sm text-[#78867f]">
                Indicadores atuais do seu negócio.
              </p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-[#e4ebe7]">
              <div className="p-6">
                <p className="text-sm text-[#78867f]">Concluídos</p>
                <p className="mt-2 text-2xl font-semibold">{completed}</p>
              </div>

              <div className="p-6">
                <p className="text-sm text-[#78867f]">Cancelados</p>
                <p className="mt-2 text-2xl font-semibold">
                  {analytics?.appointments?.cancelled ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Ações rápidas</h2>
                <p className="mt-1 text-sm text-[#78867f]">
                  Acesse as áreas principais.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <a
                href="/app/clientes"
                className="rounded-xl bg-[#30463c] px-4 py-3 text-center text-sm font-semibold text-white"
              >
                Clientes
              </a>

              <a
                href="/app/agenda"
                className="rounded-xl border border-[#dce5e0] px-4 py-3 text-center text-sm font-semibold text-[#30463c]"
              >
                Agenda
              </a>

              <a
                href="/app/inteligencia"
                className="rounded-xl border border-[#dce5e0] px-4 py-3 text-center text-sm font-semibold text-[#30463c]"
              >
                Inteligência
              </a>
            </div>
          </div>
        </section>

        {analytics?.professionals &&
          analytics.professionals.length > 0 && (
            <section className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white">
              <div className="border-b border-[#e4ebe7] p-6">
                <h2 className="text-lg font-semibold">
                  Desempenho dos profissionais
                </h2>
                <p className="mt-1 text-sm text-[#78867f]">
                  Receita e volume de atendimentos.
                </p>
              </div>

              <div className="divide-y divide-[#e4ebe7]">
                {analytics.professionals.map((professional, index) => (
                  <div
                    key={`${professional.name}-${index}`}
                    className="flex items-center justify-between px-6 py-4"
                  >
                    <div>
                      <p className="font-semibold">{professional.name}</p>
                      <p className="text-sm text-[#78867f]">
                        {professional.appointments ?? 0} atendimentos
                      </p>
                    </div>

                    <p className="font-semibold">
                      {money(professional.revenue ?? 0)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

        <section className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white">
          <div className="flex items-center justify-between border-b border-[#e4ebe7] p-6">
            <div>
              <h2 className="text-lg font-semibold">Clientes recentes</h2>
              <p className="mt-1 text-sm text-[#78867f]">
                Seus clientes cadastrados no CRM.
              </p>
            </div>

            <a
              href="/app/clientes"
              className="rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white"
            >
              Novo cliente
            </a>
          </div>

          <div className="p-6">
            {loading ? (
              <p className="text-sm text-[#78867f]">Carregando...</p>
            ) : clients.length === 0 ? (
              <p className="text-sm text-[#78867f]">
                Nenhum cliente cadastrado ainda.
              </p>
            ) : (
              <div className="divide-y divide-[#e4ebe7]">
                {clients.slice(0, 5).map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between py-4"
                  >
                    <div>
                      <p className="font-semibold">{client.name}</p>
                      <p className="text-sm text-[#78867f]">
                        {client.phone || client.email || "Sem contato"}
                      </p>
                    </div>

                    <span className="text-sm text-[#78867f]">
                      {client.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e4ebe7] bg-white p-6">
      <p className="text-sm text-[#78867f]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-[#78867f]">{detail}</p>
    </div>
  );
}
