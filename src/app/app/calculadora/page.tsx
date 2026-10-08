"use client";

import { useState } from "react";

const inputClass =
  "mt-2 min-h-11 w-full rounded-xl border border-[#dce5e0] bg-white p-3 text-[#26352f]";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function PricingCalculatorPage() {
  const [costs, setCosts] = useState({
    materials: "0",
    labor: "0",
    expenses: "0",
    fees: "0",
    targetMargin: "30",
  });

  const materials = Number(costs.materials);
  const labor = Number(costs.labor);
  const expenses = Number(costs.expenses);
  const feesPercent = Number(costs.fees);
  const marginPercent = Number(costs.targetMargin);
  const costsAreValid =
    [materials, labor, expenses].every((value) => Number.isFinite(value) && value >= 0) &&
    [feesPercent, marginPercent].every(
      (value) => Number.isFinite(value) && value >= 0 && value < 100
    );
  const totalCost = materials + labor + expenses;
  const fees = feesPercent / 100;
  const targetMargin = marginPercent / 100;
  const minimumDenominator = 1 - fees;
  const suggestedDenominator = 1 - fees - targetMargin;
  const minimumPrice =
    costsAreValid && minimumDenominator > 0
      ? totalCost / minimumDenominator
      : null;
  const suggestedPrice =
    costsAreValid && suggestedDenominator > 0
      ? totalCost / suggestedDenominator
      : null;
  const expectedProfit =
    suggestedPrice === null
      ? null
      : suggestedPrice * (1 - fees) - totalCost;

  function updateCost(field: keyof typeof costs, value: string) {
    const normalized = value.replace(/^0+(?=\d)/, "");
    setCosts((current) => ({ ...current, [field]: normalized || "0" }));
  }

  return (
    <main className="app-main-min-h bg-[#fbfaf8] px-4 py-7 text-[#26352f] sm:px-6 sm:py-9 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-7">
          <h1 className="text-3xl font-semibold tracking-tight text-[#30463c]">
            Calculadora de preços
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#78867f]">
            Estime um preço para cada atendimento considerando custos, taxas e
            a margem que deseja alcançar.
          </p>
        </header>

        <section className="rounded-2xl border border-[#e4ebe7] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-[#30463c]">Custos por atendimento</h2>
          <p className="mt-1 text-sm leading-5 text-[#78867f]">
            Informe valores aproximados para um único atendimento.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-[#50655b]">
              Materiais e produtos usados
              <span className="mt-1 block text-xs font-normal text-[#8a9891]">
                Por exemplo, produtos descartáveis e cosméticos.
              </span>
              <input
                aria-label="Materiais e produtos usados"
                className={inputClass}
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={costs.materials}
                onChange={(event) => updateCost("materials", event.target.value)}
              />
            </label>

            <label className="text-sm font-medium text-[#50655b]">
              Valor do seu trabalho
              <span className="mt-1 block text-xs font-normal text-[#8a9891]">
                Quanto deseja receber pelo tempo dedicado.
              </span>
              <input
                aria-label="Valor do seu trabalho"
                className={inputClass}
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={costs.labor}
                onChange={(event) => updateCost("labor", event.target.value)}
              />
            </label>

            <label className="text-sm font-medium text-[#50655b]">
              Parte das despesas do negócio
              <span className="mt-1 block text-xs font-normal text-[#8a9891]">
                Estime quanto aluguel, energia e outras despesas representam.
              </span>
              <input
                aria-label="Parte das despesas do negócio"
                className={inputClass}
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={costs.expenses}
                onChange={(event) => updateCost("expenses", event.target.value)}
              />
            </label>

            <label className="text-sm font-medium text-[#50655b]">
              Taxas sobre a venda (%)
              <span className="mt-1 block text-xs font-normal text-[#8a9891]">
                Inclua taxas de cartão ou outros custos cobrados sobre o valor.
              </span>
              <input
                aria-label="Taxas sobre a venda (%)"
                className={inputClass}
                type="number"
                min="0"
                max="99.99"
                step="0.01"
                inputMode="decimal"
                value={costs.fees}
                onChange={(event) => updateCost("fees", event.target.value)}
              />
            </label>

            <label className="text-sm font-medium text-[#50655b] sm:col-span-2">
              Margem de lucro desejada (%)
              <span className="mt-1 block text-xs font-normal text-[#8a9891]">
                A margem é calculada sobre o preço cobrado, depois dos custos e taxas.
              </span>
              <input
                aria-label="Margem de lucro desejada (%)"
                className={inputClass}
                type="number"
                min="0"
                max="99.99"
                step="0.01"
                inputMode="decimal"
                value={costs.targetMargin}
                onChange={(event) => updateCost("targetMargin", event.target.value)}
              />
            </label>
          </div>
        </section>

        <section
          aria-live="polite"
          className="mt-5 rounded-2xl border border-[#e4ebe7] bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 className="font-semibold text-[#30463c]">Resultado estimado</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[#f7faf8] p-4">
              <p className="text-sm text-[#78867f]">Custo total estimado</p>
              <p className="mt-2 text-xl font-semibold text-[#30463c]">
                {costsAreValid ? formatCurrency(totalCost) : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-[#f7faf8] p-4">
              <p className="text-sm text-[#78867f]">Preço mínimo para cobrir os custos</p>
              <p className="mt-2 text-xl font-semibold text-[#30463c]">
                {minimumPrice === null ? "—" : formatCurrency(minimumPrice)}
              </p>
              <p className="mt-1 text-xs text-[#8a9891]">
                Considera as taxas informadas, sem lucro.
              </p>
            </div>
            <div className="rounded-xl bg-[#edf3ef] p-4 sm:col-span-2">
              <p className="text-sm font-medium text-[#50655b]">
                Preço sugerido com a margem desejada
              </p>
              <p className="mt-2 text-2xl font-semibold text-[#30463c]">
                {suggestedPrice === null ? "—" : formatCurrency(suggestedPrice)}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#6f8177]">
                Lucro estimado após custos e taxas:{" "}
                {expectedProfit === null ? "—" : formatCurrency(expectedProfit)}.
              </p>
            </div>
          </div>

          {!costsAreValid ? (
            <p role="alert" className="mt-4 text-sm text-red-700">
              Informe valores iguais ou maiores que zero e percentuais menores que 100%.
            </p>
          ) : suggestedPrice === null ? (
            <p role="alert" className="mt-4 text-sm text-red-700">
              A soma das taxas e da margem desejada precisa ser menor que 100% para calcular um preço.
            </p>
          ) : null}
        </section>

        <p className="mt-4 text-xs leading-5 text-[#8a9891]">
          Esta ferramenta é apenas uma estimativa gerencial. Os valores dependem
          dos custos informados e não substituem orientação contábil nem
          consideram despesas que não foram preenchidas.
        </p>
      </div>
    </main>
  );
}
