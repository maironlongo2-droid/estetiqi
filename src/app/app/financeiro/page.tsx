"use client";

import { useEffect, useState } from "react";

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

export default function FinanceiroPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<"today" | "7days" | "month" | "all">("month");

  async function loadPayments() {
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
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar o financeiro."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayments();
  }, []);

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
    <main className="min-h-screen bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#30463c]">
            Financeiro
          </h1>

          <p className="mt-1 text-sm text-[#78867f]">
            Acompanhe entradas, pagamentos e formas de recebimento.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

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
          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-sm text-[#78867f]">
              Receita recebida
            </p>

            <p className="mt-2 text-2xl font-semibold text-[#30463c]">
              {money(revenue)}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-sm text-[#78867f]">
              Pagamentos recebidos
            </p>

            <p className="mt-2 text-2xl font-semibold text-[#30463c]">
              {paidPayments.length}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4ebe7] bg-white p-5">
            <p className="text-sm text-[#78867f]">
              Ticket médio
            </p>

            <p className="mt-2 text-2xl font-semibold text-[#30463c]">
              {money(ticketAverage)}
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
                className="rounded-2xl border border-[#e4ebe7] bg-white p-5"
              >
                <p className="text-sm text-[#78867f]">
                  {label}
                </p>

                <p className="mt-2 text-xl font-semibold text-[#30463c]">
                  {money(byMethod[key as keyof typeof byMethod])}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e4ebe7] bg-white">
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
                Nenhum pagamento registrado.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#eef2ef] text-xs text-[#78867f]">
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4">Procedimento</th>
                    <th className="px-6 py-4">Forma</th>
                    <th className="px-6 py-4">Valor</th>
                    <th className="px-6 py-4">Data</th>
                    <th className="px-6 py-4">Status</th>
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
                        <span
                          className={
                            payment.status === "paid"
                              ? "rounded-lg bg-[#edf7ef] px-2 py-1 text-xs font-medium text-[#477152]"
                              : "rounded-lg bg-[#f4f4f2] px-2 py-1 text-xs text-[#78867f]"
                          }
                        >
                          {payment.status === "paid"
                            ? "Pago"
                            : payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
