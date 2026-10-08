"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const states = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

export default function OnboardingPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/organization", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          businessPhone,
          city,
          state,
          businessType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar.");
      }

      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar os dados."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-main-min-h bg-[#fbfaf8] px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a9f8d]">
            Primeiros passos
          </p>

          <h1 className="mt-3 text-3xl font-semibold text-[#30463c]">
            Vamos configurar seu negócio
          </h1>

          <p className="mt-3 text-[#78867f]">
            Essas informações serão usadas para personalizar sua experiência
            no EstetiQi.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-[0_20px_60px_rgba(64,91,78,0.08)]"
        >
          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#405149]">
                Nome do negócio *
              </span>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Estética Mairon"
                className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#405149]">
                Telefone
              </span>
              <input
                value={businessPhone}
                onChange={(event) => setBusinessPhone(event.target.value)}
                placeholder="(21) 99999-9999"
                className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#405149]">
                  Cidade
                </span>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Rio de Janeiro"
                  className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#405149]">
                  Estado
                </span>
                <select
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                  className="w-full rounded-xl border border-[#dfe9e3] bg-white px-4 py-3 outline-none focus:border-[#7a9f8d]"
                >
                  <option value="">Selecione</option>
                  {states.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#405149]">
                Tipo de negócio
              </span>
              <input
                value={businessType}
                onChange={(event) => setBusinessType(event.target.value)}
                placeholder="Ex.: Estética e beleza"
                className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
              />
            </label>

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#527765] px-5 py-3 font-medium text-white transition hover:bg-[#456957] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Continuar"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
