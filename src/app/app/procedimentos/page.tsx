"use client";

import { FormEvent, useEffect, useState } from "react";

type Procedure = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  duration_minutes: number | null;
  return_interval_days: number | null;
  status: string;
};

export default function ProcedimentosPage() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<Procedure | null>(null);
  const [error, setError] = useState("");

  async function loadProcedures() {
    const response = await fetch("/api/procedures");
    const data = await response.json();

    if (response.ok) {
      setProcedures(data.procedures || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadProcedures();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const price = Number(form.get("price"));
    const durationMinutes = Number(form.get("durationMinutes"));
    const returnIntervalDays = Number(form.get("returnIntervalDays"));

    const response = await fetch("/api/procedures", {
      method: editingProcedure ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(editingProcedure ? { id: editingProcedure.id } : {}),
        name: form.get("name"),
        description: form.get("description"),
        price: price || undefined,
        durationMinutes: durationMinutes || undefined,
        returnIntervalDays: returnIntervalDays || undefined,
        status: "active",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Não foi possível cadastrar o procedimento.");
      setSaving(false);
      return;
    }

    formElement.reset();
    setShowForm(false);
    setEditingProcedure(null);
    setSaving(false);
    await loadProcedures();
  }


  function startEditing(procedure: Procedure) {
    setEditingProcedure(procedure);
    setShowForm(true);
    setError("");
  }

  async function handleDelete(procedure: Procedure) {
    if (!window.confirm(`Excluir o procedimento "${procedure.name}"?`)) {
      return;
    }

    setError("");

    const response = await fetch("/api/procedures", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: procedure.id }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Não foi possível excluir o procedimento.");
      return;
    }

    await loadProcedures();
  }

  return (
    <main className="min-h-screen bg-[#fbfaf8] text-[#26352f]">


      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Seus procedimentos</h2>
            <p className="mt-1 text-sm text-[#78867f]">
              Cadastre os serviços oferecidos pela sua empresa.
            </p>
          </div>

          <button type="button"
            onClick={() => {
              setShowForm(!showForm);
              setError("");
            }}
            className="rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white"
          >
            {showForm ? "Fechar" : "Novo procedimento"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white p-6"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="text-sm font-medium">Nome *</span>
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={editingProcedure?.name || ""}
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                  placeholder="Ex.: Limpeza de pele"
                />
              </label>

              <label className="md:col-span-2">
                <span className="text-sm font-medium">Descrição</span>
                <textarea
                  name="description"
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                  placeholder="Descrição do procedimento"
                  defaultValue={editingProcedure?.description || ""}
                />
              </label>

              <label>
                <span className="text-sm font-medium">Preço</span>
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                  placeholder="150.00"
                  defaultValue={editingProcedure?.price ?? ""}
                />
              </label>

              <label>
                <span className="text-sm font-medium">Duração (minutos)</span>
                <input
                  name="durationMinutes"
                  type="number"
                  min="1"
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                  placeholder="60"
                  defaultValue={editingProcedure?.duration_minutes ?? ""}
                />
              </label>

              <label>
                <span className="text-sm font-medium">
                  Retorno após (dias)
                </span>
                <input
                  name="returnIntervalDays"
                  type="number"
                  min="1"
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                  placeholder="30"
                  defaultValue={editingProcedure?.return_interval_days ?? ""}
                />
              </label>
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-6 rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving
                ? "Salvando..."
                : editingProcedure
                  ? "Salvar alterações"
                  : "Cadastrar procedimento"}
            </button>
          </form>
        )}

        <section className="mt-6 overflow-hidden rounded-2xl border border-[#e4ebe7] bg-white">
          {loading ? (
            <p className="p-6 text-sm text-[#78867f]">
              Carregando procedimentos...
            </p>
          ) : procedures.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium">Nenhum procedimento cadastrado.</p>
              <p className="mt-1 text-sm text-[#78867f]">
                Clique em “Novo procedimento” para começar.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#e4ebe7]">
              {procedures.map((procedure) => (
                <div
                  key={procedure.id}
                  className="flex items-center justify-between gap-4 p-5"
                >
                  <div>
                    <p className="font-semibold">{procedure.name}</p>
                    <p className="mt-1 text-sm text-[#78867f]">
                      {procedure.description || "Sem descrição"}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {procedure.price !== null && (
                        <p className="font-semibold">
                          R$ {Number(procedure.price).toFixed(2)}
                        </p>
                      )}
                      <span className="text-xs text-[#78867f]">
                        {procedure.duration_minutes
                          ? `${procedure.duration_minutes} min`
                          : "Duração não definida"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => startEditing(procedure)}
                      className="rounded-lg border border-[#dfe9e3] px-3 py-2 text-sm font-medium"
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(procedure)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
