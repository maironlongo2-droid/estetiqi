"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
// Apenas o TIPO é importado (import type é apagado na compilação), evitando
// puxar o módulo de banco para o bundle do navegador.
import type { PlatformMetrics } from "@/lib/analytics/platform-metrics";

const PERIOD_OPTIONS = [
  { days: 7, label: "Últimos 7 dias" },
  { days: 30, label: "Últimos 30 dias" },
  { days: 90, label: "Últimos 90 dias" },
] as const;

const numberFormatter = new Intl.NumberFormat("pt-BR");
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

// Tempo aproximado até a primeira resposta, em linguagem simples.
function formatDuration(seconds: number | null) {
  if (seconds === null) {
    return "Ainda sem respostas registradas";
  }

  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }

  if (seconds < 86400) {
    return `${(seconds / 3600).toFixed(1).replace(".", ",")} h`;
  }

  return `${(seconds / 86400).toFixed(1).replace(".", ",")} dias`;
}

// Rótulos amigáveis para os tipos/estados de oportunidade. Valores desconhecidos
// são exibidos como recebidos (sem inventar significado).
const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  client_return: "Retorno de cliente",
};

const OPPORTUNITY_STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  approved: "Aprovada",
  dismissed: "Descartada",
  completed: "Concluída",
};

function opportunityTypeLabel(type: string) {
  return OPPORTUNITY_TYPE_LABELS[type] ?? type;
}

function opportunityStatusLabel(status: string) {
  return OPPORTUNITY_STATUS_LABELS[status] ?? status;
}

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  note?: string;
};

function StatCard({ label, value, hint, note }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-[#8a9891]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[#30463c]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[#66756d]">{hint}</p> : null}
      {note ? <p className="mt-2 text-[11px] text-[#8a9891]">{note}</p> : null}
    </div>
  );
}

type SectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

function Section({ title, description, children }: SectionProps) {
  return (
    <section className="rounded-3xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-[#30463c]">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs text-[#78867f]">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function PlatformPanel() {
  const [period, setPeriod] = useState<number>(30);
  const [data, setData] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMetrics = useCallback(async (days: number) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/panel?days=${days}`);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Não foi possível carregar os indicadores."
        );
      }

      setData(payload as PlatformMetrics);
    } catch (loadError) {
      setData(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os indicadores."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Adia a chamada para fora do corpo síncrono do efeito (evita setState
    // síncrono no efeito) e ignora a resposta se o componente desmontar.
    void Promise.resolve().then(() => {
      if (active) return loadMetrics(period);
      return undefined;
    });

    return () => {
      active = false;
    };
  }, [loadMetrics, period]);

  return (
    <main className="app-min-h min-h-screen bg-[#fbfaf8] text-[#26352f]">
      <header className="border-b border-[#e4ebe7] bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-semibold text-[#30463c]">
              Painel da plataforma EstetiQi
            </h1>
            <p className="text-xs text-[#8a9891]">
              Visão agregada de todas as organizações. Somente leitura.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/suporte"
              className="rounded-lg border border-[#dfe9e3] px-4 py-2 text-sm font-medium text-[#50655b] transition hover:bg-[#f4f7f5]"
            >
              Central de suporte
            </Link>
            <Link
              href="/app"
              className="rounded-lg border border-[#dfe9e3] px-4 py-2 text-sm font-medium text-[#50655b] transition hover:bg-[#f4f7f5]"
            >
              Voltar ao app
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[#50655b]">Período:</span>
          {PERIOD_OPTIONS.map((option) => {
            const active = option.days === period;

            return (
              <button
                key={option.days}
                type="button"
                onClick={() => setPeriod(option.days)}
                aria-pressed={active}
                className={`min-h-9 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-[#30463c] text-white"
                    : "border border-[#dfe9e3] text-[#50655b] hover:bg-[#f4f7f5]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={() => void loadMetrics(period)}
              className="mt-4 min-h-11 rounded-xl bg-[#30463c] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#263a31]"
            >
              Tentar novamente
            </button>
          </div>
        ) : loading && !data ? (
          <p className="rounded-3xl border border-[#e4ebe7] bg-white p-6 text-sm text-[#78867f]">
            Carregando indicadores...
          </p>
        ) : !data ? (
          <p className="rounded-3xl border border-[#e4ebe7] bg-white p-6 text-sm text-[#78867f]">
            Nenhum indicador disponível.
          </p>
        ) : (
          <div className="space-y-6">
            {loading ? (
              <p className="text-xs text-[#8a9891]">Atualizando...</p>
            ) : null}

            <Section
              title="Crescimento"
              description="Novas organizações no período selecionado."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Organizações cadastradas"
                  value={formatNumber(data.growth.totalOrganizations)}
                  hint="Total na plataforma"
                />
                <StatCard
                  label={`Novas organizações (${data.periodDays}d)`}
                  value={formatNumber(data.growth.newOrganizations)}
                  hint="Criadas no período"
                />
              </div>
            </Section>

            <Section
              title="Ativação"
              description="Proxy de ativação: onboarding concluído + ao menos 1 cliente + ao menos 1 agendamento."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Organizações ativadas"
                  value={formatNumber(data.activation.activatedOrganizations)}
                  hint="Atendem ao critério acima"
                />
                <StatCard
                  label="Percentual de ativação"
                  value={formatPercent(data.activation.rate)}
                  hint="Sobre o total de organizações"
                  note="Indicador proxy — não comprova uso recorrente."
                />
              </div>
            </Section>

            <Section
              title="Atividade"
              description="Atividade observável nos registros existentes (agenda, clientes, pagamentos, eventos e ações de IA). Não é contagem de logins."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Ativas nos últimos 7 dias"
                  value={formatNumber(data.activity.activeLast7Days)}
                  hint="Com registros nos últimos 7 dias"
                  note="Indicador aproximado de uso."
                />
                <StatCard
                  label="Ativas nos últimos 30 dias"
                  value={formatNumber(data.activity.activeLast30Days)}
                  hint="Com registros nos últimos 30 dias"
                  note="Indicador aproximado de uso."
                />
              </div>
            </Section>

            <Section
              title="Operação"
              description="Totais da plataforma e o quanto ocorreu no período selecionado."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Clientes cadastrados"
                  value={formatNumber(data.operation.totalClients)}
                  hint={`${formatNumber(
                    data.operation.clientsInPeriod
                  )} no período`}
                />
                <StatCard
                  label="Agendamentos"
                  value={formatNumber(data.operation.totalAppointments)}
                  hint={`${formatNumber(
                    data.operation.appointmentsInPeriod
                  )} no período`}
                />
                <StatCard
                  label="Pagamentos registrados"
                  value={formatNumber(data.operation.totalPayments)}
                  hint={`${formatNumber(
                    data.operation.paymentsInPeriod
                  )} no período`}
                />
              </div>
            </Section>


            <Section
              title="Inteligência artificial"
              description="Oportunidades por tipo e estado, ações registradas e aberturas do WhatsApp. A relação entre oportunidades e ações é aproximada."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Oportunidades"
                  value={formatNumber(data.ai.totalOpportunities)}
                  hint={`${formatNumber(data.ai.openOpportunities)} abertas`}
                />
                <StatCard
                  label="Ações registradas"
                  value={formatNumber(data.ai.totalActions)}
                  hint={`${formatNumber(
                    data.ai.actionsInPeriod
                  )} no período`}
                />
                <StatCard
                  label="Aberturas do WhatsApp"
                  value={formatNumber(data.ai.whatsappOpens)}
                  hint={`${formatNumber(
                    data.ai.whatsappOpensInPeriod
                  )} no período`}
                  note="Não confirma envio, leitura nem venda."
                />
              </div>

              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold text-[#30463c]">
                  Oportunidades por tipo e estado
                </h3>
                {data.ai.opportunitiesByTypeStatus.length === 0 ? (
                  <p className="rounded-2xl border border-[#e4ebe7] bg-[#fbfaf8] p-4 text-sm text-[#78867f]">
                    Nenhuma oportunidade registrada até agora.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-[#e4ebe7]">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#f4f7f5] text-xs uppercase tracking-wide text-[#8a9891]">
                        <tr>
                          <th className="px-4 py-2 font-medium">Tipo</th>
                          <th className="px-4 py-2 font-medium">Estado</th>
                          <th className="px-4 py-2 text-right font-medium">
                            Quantidade
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e4ebe7]">
                        {data.ai.opportunitiesByTypeStatus.map((item) => (
                          <tr key={`${item.type}-${item.status}`}>
                            <td className="px-4 py-2 text-[#405149]">
                              {opportunityTypeLabel(item.type)}
                            </td>
                            <td className="px-4 py-2 text-[#405149]">
                              {opportunityStatusLabel(item.status)}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-[#30463c]">
                              {formatNumber(item.count)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Section>


            <Section
              title="Suporte"
              description="Situação das solicitações de todas as organizações clientes."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Solicitações pendentes"
                  value={formatNumber(data.support.pending)}
                  hint={`${formatNumber(
                    data.support.open
                  )} abertas · ${formatNumber(
                    data.support.inProgress
                  )} em andamento`}
                />
                <StatCard
                  label="Resolvidas"
                  value={formatNumber(data.support.resolved)}
                  hint="Somente resolvidas"
                />
                <StatCard
                  label="Fechadas"
                  value={formatNumber(data.support.closed)}
                  hint="Somente fechadas"
                />
                <StatCard
                  label="Total de solicitações"
                  value={formatNumber(data.support.total)}
                  hint="Todo o histórico"
                />
                <StatCard
                  label="Tempo médio até 1ª resposta"
                  value={formatDuration(
                    data.support.averageFirstResponseSeconds
                  )}
                  hint="Calculado pelas mensagens existentes"
                  note="Indicador aproximado."
                />
              </div>
            </Section>

            <Section
              title="Volume financeiro rastreado"
              description="Soma agregada dos pagamentos efetivamente pagos em todas as organizações."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Volume pago (todo o histórico)"
                  value={formatCurrency(data.finance.paidVolumeTotal)}
                  hint="Pagamentos com status 'pago'"
                  note="Volume REGISTRADO no sistema. Não é a receita da EstetiQI."
                />
                <StatCard
                  label={`Volume pago (${data.periodDays}d)`}
                  value={formatCurrency(data.finance.paidVolumeInPeriod)}
                  hint="Somente o período selecionado"
                  note="Volume registrado no sistema."
                />
              </div>
            </Section>
          </div>
        )}
      </div>
    </main>
  );
}

