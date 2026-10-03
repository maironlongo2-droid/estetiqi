"use client";

import { FormEvent, useEffect, useState } from "react";

type Automation = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  active: boolean;
  config: Record<string, unknown>;
};

const typeLabels: Record<string, string> = {
  inactive_client: "Cliente inativo",
  birthday: "Aniversário",
  procedure_return: "Retorno de procedimento",
};

export default function AutomacoesPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("inactive_client");
  const [loading, setLoading] = useState(false);
  const [inactiveDays, setInactiveDays] = useState("60");
  const [inactiveClients, setInactiveClients] = useState<any[]>([]);
  const [inactiveLoading, setInactiveLoading] = useState(false);

  async function loadAutomations() {
    const response = await fetch("/api/automations");
    if (response.ok) setAutomations(await response.json());
  }

  useEffect(() => {
    loadAutomations();
    loadInactiveClients();
  }, []);

  async function loadInactiveClients() {
    setInactiveLoading(true);

    const response = await fetch(
      `/api/automations/inactive-clients?days=${inactiveDays}`
    );

    if (response.ok) {
      const data = await response.json();
      setInactiveClients(data.clients ?? []);
    }

    setInactiveLoading(false);
  }

  async function createAutomation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const response = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        description: `Automação de ${typeLabels[type].toLowerCase()}.`,
      }),
    });

    if (response.ok) {
      setName("");
      await loadAutomations();
    }

    setLoading(false);
  }

  async function runInactiveClients() {
    await loadInactiveClients();
  }

  async function toggleAutomation(automation: Automation) {
    const response = await fetch(`/api/automations/${automation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !automation.active }),
    });

    if (!response.ok) return;

    const updated = await response.json();

    setAutomations((current) =>
      current.map((item) =>
        item.id === updated.id ? { ...item, active: updated.active } : item
      )
    );
  }

  return (
    <main className="min-h-[calc(100vh-73px)] bg-[#fbfaf8] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a9f8d]">
            Automação
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[#30463c]">
            Automatize o relacionamento com seus clientes
          </h1>
          <p className="mt-2 text-[#78867f]">
            Crie regras que o EstetiQI poderá executar automaticamente.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <form
            onSubmit={createAutomation}
            className="rounded-3xl border border-[#dfe9e3] bg-white p-6"
          >
            <h2 className="text-lg font-semibold text-[#30463c]">
              Nova automação
            </h2>

            <div className="mt-5 space-y-4">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Recuperar clientes inativos"
                className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#7a9f8d]"
              />

              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-xl border border-[#dfe9e3] bg-white px-4 py-3 outline-none focus:border-[#7a9f8d]"
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#527765] px-5 py-3 font-medium text-white hover:bg-[#456957] disabled:opacity-60"
              >
                {loading ? "Criando..." : "Criar automação"}
              </button>
            </div>
          </form>

          <section className="mb-8 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#30463c]">
              Clientes inativos
            </h2>
            <p className="mt-1 text-sm text-[#78867f]">
              Clientes que não tiveram atendimento concluído dentro do período definido.
            </p>
          </div>

          <div className="flex items-end gap-3">
            <label className="text-sm text-[#52635b]">
              Inatividade
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
              onClick={runInactiveClients}
              className="rounded-xl bg-[#527765] px-4 py-2 text-sm font-medium text-white"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-[#f5f8f6] p-5">
          <div className="text-3xl font-semibold text-[#30463c]">
            {inactiveLoading ? "..." : inactiveClients.length}
          </div>
          <div className="text-sm text-[#78867f]">
            clientes encontrados
          </div>
        </div>

        {inactiveClients.length > 0 && (
          <div className="mt-5 space-y-3">
            {inactiveClients.map((client) => (
              <div
                key={client.id}
                className="flex items-center justify-between rounded-2xl border border-[#e5ebe7] px-4 py-3"
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

      <section className="space-y-3">
            {automations.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#cfdcd5] bg-white p-10 text-center text-[#78867f]">
                Nenhuma automação criada ainda.
              </div>
            ) : (
              automations.map((automation) => (
                <div
                  key={automation.id}
                  className="flex items-center justify-between rounded-2xl border border-[#dfe9e3] bg-white p-5"
                >
                  <div>
                    <h3 className="font-semibold text-[#30463c]">
                      {automation.name}
                    </h3>
                    <p className="mt-1 text-sm text-[#78867f]">
                      {typeLabels[automation.type]}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={automation.active}
                    aria-label={`${automation.active ? "Desativar" : "Ativar"} ${automation.name}`}
                    onClick={() => toggleAutomation(automation)}
                    className={`relative h-7 w-12 rounded-full transition ${
                      automation.active ? "bg-[#527765]" : "bg-[#cbd5d0]"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
                        automation.active ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
