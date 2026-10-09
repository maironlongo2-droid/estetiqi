"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "../toast";
import { useProcedureLabels } from "../procedure-labels";

type Payment = {
  id: string;
  client_id: string;
  client_name: string;
  appointment_id: string | null;
  procedure_id: string | null;
  procedure_name: string | null;
  amount: number;
  payment_method: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
};

const methodLabels: Record<string, string> = {
  pix: "Pix",
  credito: "Crédito",
  debito: "Débito",
  dinheiro: "Dinheiro",
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function date(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const paymentStatusLabels: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  cancelled: "Cancelado",
  refunded: "Estornado",
};

const editablePaymentStatuses = [
  "pending",
  "paid",
  "cancelled",
  "refunded",
] as const;

function paymentStatusLabel(status: string) {
  return paymentStatusLabels[status] ?? status;
}

function paymentStatusBadgeClass(status: string) {
  if (status === "paid") {
    return "rounded-lg bg-[#edf7ef] px-2 py-1 text-xs font-medium text-[#477152]";
  }

  if (status === "pending") {
    return "rounded-lg bg-[#fff7e8] px-2 py-1 text-xs font-medium text-[#8a641d]";
  }

  return "rounded-lg bg-[#f4f4f2] px-2 py-1 text-xs font-medium text-[#78867f]";
}

export default function FinanceiroPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const { notifyError, notifySuccess } = useToast();
  const labels = useProcedureLabels();
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<"today" | "7days" | "month" | "all">("month");
  // Espelha a permissão finance:update (RBAC: owner e admin).
  const [canManagePayments, setCanManagePayments] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/payments");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível carregar o financeiro."
        );
      }

      setPayments(data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível carregar o financeiro.";
      setError(message);
      notifyError(message);
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadPayments();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadPayments]);

  useEffect(() => {
    let active = true;

    async function loadRole() {
      try {
        const response = await fetch("/api/auth/context");

        if (!response.ok) return;

        const data = await response.json();

        if (!active) return;

        setCanManagePayments(data.role === "owner" || data.role === "admin");
      } catch {
        // Sem permissão confirmada, o controle de status permanece oculto.
      }
    }

    loadRole();

    return () => {
      active = false;
    };
  }, []);

  async function changePaymentStatus(payment: Payment, nextStatus: string) {
    if (nextStatus === payment.status) return;

    const confirmed = window.confirm(
      `Alterar o status do pagamento de ${payment.client_name} de "${paymentStatusLabel(
        payment.status
      )}" para "${paymentStatusLabel(nextStatus)}"?`
    );

    if (!confirmed) return;

    setStatusSavingId(payment.id);

    try {
      const response = await fetch(`/api/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível atualizar o pagamento."
        );
      }

      setPayments((current) =>
        current.map((item) =>
          item.id === payment.id
            ? {
                ...item,
                amount: Number(data.amount),
                payment_method: data.payment_method ?? null,
                status: data.status,
                paid_at: data.paid_at ?? null,
              }
            : item
        )
      );
      notifySuccess("Status do pagamento atualizado.");
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar o pagamento."
      );
    } finally {
      setStatusSavingId(null);
    }
  }

  const periodStart = (() => {
    if (period === "all") return null;

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (period === "7days") {
      start.setDate(start.getDate() - 6);
    }

    if (period === "month") {
      start.setDate(1);
    }

    return start;
  })();

  const filteredPayments = payments.filter((payment) => {
    if (!periodStart) return true;

    const paymentDate = new Date(
      payment.paid_at || payment.created_at
    );

    if (period === "today") {
      return paymentDate >= periodStart;
    }

    return paymentDate >= periodStart;
  });

  const paidPayments = filteredPayments.filter(
    (payment) => payment.status === "paid"
  );
  const metricsUnavailable = loading || Boolean(error);

  const revenue = paidPayments.reduce(
    (total, payment) => total + Number(payment.amount),
    0
  );

  const ticketAverage =
    paidPayments.length > 0
      ? revenue / paidPayments.length
      : 0;

  const byMethod = {
    pix: paidPayments
      .filter((payment) => payment.payment_method === "pix")
      .reduce((total, payment) => total + Number(payment.amount), 0),

    credito: paidPayments
      .filter((payment) => payment.payment_method === "credito")
      .reduce((total, payment) => total + Number(payment.amount), 0),

    debito: paidPayments
      .filter((payment) => payment.payment_method === "debito")
      .reduce((total, payment) => total + Number(payment.amount), 0),

    dinheiro: paidPayments
      .filter((payment) => payment.payment_method === "dinheiro")
      .reduce((total, payment) => total + Number(payment.amount), 0),
  };

  return (
    <main className="app-main-min-h bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <header className="mb-7">
          <h1 className="text-3xl font-semibold tracking-tight text-[#30463c]">
            Financeiro
          </h1>

          <p className="mt-2 text-sm leading-6 text-[#78867f]">
            Acompanhe entradas, pagamentos e formas de recebimento.
          </p>
        </header>

        <section className="mt-6 flex flex-wrap gap-2">
          {[
            ["today", "Hoje"],
            ["7days", "7 dias"],
            ["month", "Este mês"],
            ["all", "Tudo"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setPeriod(value as "today" | "7days" | "month" | "all")
              }
              className={
                period === value
                  ? "rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-xl border border-[#dce5e0] bg-white px-4 py-2 text-sm text-[#50655b]"
              }
            >
              {label}
            </button>
          ))}
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5 shadow-sm">
            <p className="text-sm text-[#78867f]">
              Receita recebida
            </p>

            <p className="mt-2 text-2xl font-semibold text-[#30463c]">
              {metricsUnavailable ? "—" : money(revenue)}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5 shadow-sm">
            <p className="text-sm text-[#78867f]">
              Pagamentos recebidos
            </p>

            <p className="mt-2 text-2xl font-semibold text-[#30463c]">
              {metricsUnavailable ? "—" : paidPayments.length}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5 shadow-sm">
            <p className="text-sm text-[#78867f]">
              Ticket médio
            </p>

            <p className="mt-2 text-2xl font-semibold text-[#30463c]">
              {metricsUnavailable ? "—" : money(ticketAverage)}
            </p>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold text-[#30463c]">
            Formas de pagamento
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {[
              ["pix", "Pix"],
              ["credito", "Crédito"],
              ["debito", "Débito"],
              ["dinheiro", "Dinheiro"],
            ].map(([key, label]) => (
              <div
                key={key}
                className="rounded-2xl border border-[#e4ebe7] bg-white p-5 shadow-sm"
              >
                <p className="text-sm text-[#78867f]">
                  {label}
                </p>

                <p className="mt-2 text-xl font-semibold text-[#30463c]">
                  {metricsUnavailable
                    ? "—"
                    : money(byMethod[key as keyof typeof byMethod])}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 overflow-visible rounded-2xl border border-[#e4ebe7] bg-white shadow-sm md:overflow-hidden">
          <div className="border-b border-[#e4ebe7] p-6">
            <h2 className="font-semibold text-[#30463c]">
              Histórico de pagamentos
            </h2>

            <p className="mt-1 text-xs text-[#8a9891]">
              Pagamentos registrados no sistema.
            </p>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <p className="p-6 text-sm text-[#78867f]">
                Carregando financeiro...
              </p>
            ) : payments.length === 0 ? (
              <p className="p-6 text-sm text-[#78867f]">
                Nenhum pagamento registrado ainda. Quando você concluir um atendimento na Agenda e registrar o pagamento, ele aparece aqui.
              </p>
            ) : (
              <table className="hidden w-full text-left text-sm md:table">
                <thead>
                  <tr className="border-b border-[#eef2ef] text-xs text-[#78867f]">
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4">{labels.singular}</th>
                    <th className="px-6 py-4">Forma</th>
                    <th className="px-6 py-4">Valor</th>
                    <th className="px-6 py-4">Data</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {payments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-[#f0f3f1]"
                    >
                      <td className="px-6 py-4 font-medium text-[#30463c]">
                        {payment.client_name}
                      </td>

                      <td className="px-6 py-4 text-[#78867f]">
                        {payment.procedure_name || "—"}
                      </td>

                      <td className="px-6 py-4 text-[#78867f]">
                        {payment.payment_method
                          ? methodLabels[payment.payment_method] ||
                            payment.payment_method
                          : "—"}
                      </td>

                      <td className="px-6 py-4 font-medium text-[#30463c]">
                        {money(Number(payment.amount))}
                      </td>

                      <td className="px-6 py-4 text-[#78867f]">
                        {date(payment.paid_at || payment.created_at)}
                      </td>

                      <td className="px-6 py-4">
                        <span className={paymentStatusBadgeClass(payment.status)}>
                          {paymentStatusLabel(payment.status)}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {canManagePayments ? (
                          <select
                            aria-label={`Alterar status do pagamento de ${payment.client_name}`}
                            value={payment.status}
                            disabled={statusSavingId === payment.id}
                            onChange={(event) =>
                              void changePaymentStatus(payment, event.target.value)
                            }
                            className="min-h-9 rounded-lg border border-[#dce5e0] bg-white px-2 py-1 text-sm text-[#30463c] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {editablePaymentStatuses.map((status) => (
                              <option key={status} value={status}>
                                {paymentStatusLabel(status)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-[#9aa59f]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!loading && payments.length > 0 && (
            <ul className="divide-y divide-[#f0f3f1] md:hidden">
              {payments.map((payment) => (
                <li key={payment.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#30463c]">
                        {payment.client_name}
                      </p>

                      <p className="mt-1 truncate text-sm text-[#78867f]">
                        {payment.procedure_name || "—"}
                      </p>
                    </div>

                    {canManagePayments ? (
                      <details className="relative shrink-0">
                        <summary
                          aria-label={`Ações do pagamento de ${payment.client_name}`}
                          className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-[#dfe9e3] text-lg text-[#50655b] hover:bg-[#f4f7f5]"
                        >
                          ⋮
                        </summary>

                        <div
                          role="menu"
                          aria-label={`Alterar status do pagamento de ${payment.client_name}`}
                          className="absolute right-0 z-50 mt-1 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-[#e4ebe7] bg-white p-1 shadow-lg"
                        >
                          {editablePaymentStatuses.map((status) => (
                            <button
                              key={status}
                              type="button"
                              role="menuitem"
                              disabled={
                                status === payment.status ||
                                statusSavingId === payment.id
                              }
                              onClick={(event) => {
                                event.currentTarget
                                  .closest("details")
                                  ?.removeAttribute("open");
                                void changePaymentStatus(payment, status);
                              }}
                              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#30463c] hover:bg-[#f4f7f5] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <span>{paymentStatusLabel(status)}</span>

                              {status === payment.status && (
                                <span className="text-xs text-[#9aa59f]">
                                  Atual
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </details>
                    ) : (
                      <span className="shrink-0 text-xs text-[#9aa59f]">
                        —
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                    <span className={paymentStatusBadgeClass(payment.status)}>
                      {paymentStatusLabel(payment.status)}
                    </span>

                    <span className="text-[#78867f]">
                      {date(payment.paid_at || payment.created_at)}
                    </span>

                    {payment.payment_method && (
                      <span className="text-[#78867f]">
                        {methodLabels[payment.payment_method] ||
                          payment.payment_method}
                      </span>
                    )}

                    <span className="ml-auto font-semibold text-[#30463c]">
                      {money(Number(payment.amount))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
