"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useToast } from "../toast";
import { useProcedureLabels } from "../procedure-labels";
import { ProtocolManager } from "../protocol-manager";

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
  const { notifyError } = useToast();
  const labels = useProcedureLabels();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [protocolsFor, setProtocolsFor] = useState<string | null>(null);
  const listRevision = useRef(0);

  useEffect(() => {
    let current = true;
    const requestedRevision = listRevision.current;
    fetch("/api/procedures?status=active&limit=500")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Não foi possível carregar procedimentos.");
        }
        return data.procedures ?? [];
      })
      .then((data) => {
        if (current && requestedRevision === listRevision.current) {
          setProcedures(data);
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (current && requestedRevision === listRevision.current) {
          notifyError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar procedimentos."
          );
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [notifyError]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const price = Number(form.get("price"));
    const durationMinutes = Number(form.get("durationMinutes"));
    const returnIntervalDays = Number(form.get("returnIntervalDays"));

    try {
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
          status: editingProcedure?.status ?? "active",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Não foi possível salvar o ${labels.singularLower}.`);
      }

      const savedProcedure = data.procedure as Procedure;
      listRevision.current += 1;
      setProcedures((current) =>
        current.some((item) => item.id === savedProcedure.id)
          ? current.map((item) =>
              item.id === savedProcedure.id ? savedProcedure : item
            )
          : [savedProcedure, ...current]
      );
      formElement.reset();
      setShowForm(false);
      setEditingProcedure(null);
      setNotice(
        editingProcedure
          ? `${labels.singular} atualizado.`
          : `${labels.singular} cadastrado.`
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : `Não foi possível salvar o ${labels.singularLower}.`
      );
    } finally {
      setSaving(false);
    }
  }


  function startEditing(procedure: Procedure) {
    setEditingProcedure(procedure);
    setShowForm(true);
    setError("");
  }

  async function handleDelete(procedure: Procedure) {
    if (!window.confirm(`Excluir o ${labels.singularLower} "${procedure.name}"? Ele deixará de aparecer nos novos agendamentos. O histórico será preservado.`)) {
      return;
    }

    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/procedures", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: procedure.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Não foi possível excluir o ${labels.singularLower}.`);
      }
      listRevision.current += 1;
      setProcedures((current) => current.filter((item) => item.id !== procedure.id));
      setNotice(`${labels.singular} excluído. O histórico foi preservado.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : `Não foi possível excluir o ${labels.singularLower}.`
      );
    }
  }

  return (
    <main className="app-main-min-h bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <header className="mb-7">
          <h1 className="text-3xl font-semibold tracking-tight text-[#30463c]">
            {labels.plural}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#78867f]">
            Organize os {labels.pluralLower}, valores e duração dos atendimentos.
          </p>
        </header>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Seus {labels.pluralLower}</h2>
            <p className="mt-1 text-sm text-[#78867f]">
              Cadastre os {labels.pluralLower} oferecidos pela sua empresa.
            </p>
          </div>

          <button type="button"
            data-testid="procedure-form-toggle"
            onClick={() => {
              setShowForm(!showForm);
              setError("");
            }}
            className="min-h-11 rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white"
          >
            {showForm ? "Fechar" : `Novo ${labels.singularLower}`}
          </button>
        </div>

        {(error || notice) && (
          <p role={error ? "alert" : "status"} className={`mt-4 rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-[#edf7ef] text-[#477152]"}`}>
            {error || notice}
          </p>
        )}

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
                  placeholder={`Descrição do ${labels.singularLower}`}
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
              data-testid="procedure-form-submit"
              disabled={saving}
              className="mt-6 rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving
                ? "Salvando..."
                : editingProcedure
                  ? "Salvar alterações"
                  : `Cadastrar ${labels.singularLower}`}
            </button>
          </form>
        )}

        <section className="mt-6 overflow-hidden rounded-2xl border border-[#e4ebe7] bg-white">
          {loading ? (
            <p className="p-6 text-sm text-[#78867f]">
              Carregando {labels.pluralLower}...
            </p>
          ) : procedures.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium">
                Nenhum {labels.singularLower} cadastrado.
              </p>
              <p className="mt-1 text-sm text-[#78867f]">
                Cadastre os {labels.pluralLower} oferecidos pela sua empresa.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#e4ebe7]">
              {procedures.map((procedure) => (
                <div
                  key={procedure.id}
                  className="p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                    <p className="font-semibold">{procedure.name}</p>
                    <p className="mt-1 text-sm text-[#78867f]">
                      {procedure.description || "Sem descrição"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
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
                      onClick={() =>
                        setProtocolsFor((current) =>
                          current === procedure.id ? null : procedure.id
                        )
                      }
                      className="min-h-10 rounded-lg border border-[#dce5e0] px-3 py-2 text-sm font-medium"
                    >
                      {protocolsFor === procedure.id
                        ? "Fechar protocolo"
                        : "Protocolo PDF"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(procedure)}
                      className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
                    >
                      Excluir
                    </button>
                  </div>
                  </div>
                  {protocolsFor === procedure.id ? (
                    <ProtocolManager
                      key={procedure.id}
                      procedureId={procedure.id}
                      procedureName={procedure.name}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          id="protocolos"
          className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[#30463c]">
              Protocolos de Procedimentos
            </h2>
            <span className="rounded-full bg-[#edf3ef] px-2.5 py-1 text-xs font-semibold text-[#50655b]">
              Documentos
            </span>
          </div>
          <p className="mt-3 text-sm text-[#52635b]">
            Cada {labels.singularLower} tem a própria área de protocolos: clique
            em <span className="font-semibold">Protocolo PDF</span> na lista
            acima para anexar, substituir ou remover os documentos da clínica e
            acompanhar o estado real de cada envio.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-[#78867f]">
            <li>
              · Somente PDF, de até 5 MB, validado no navegador e novamente no
              servidor (tipo real e assinatura do arquivo).
            </li>
            <li>
              · O documento fica privado e separado por organização: só quem está
              autenticado no seu negócio consegue abrir o arquivo.
            </li>
            <li>
              · Pré-procedimento é enviado depois da confirmação do agendamento;
              pós-procedimento, depois do atendimento ser concluído.
            </li>
            <li>
              · O envio usa o WhatsApp oficial conectado à sua conta. Sem número
              conectado, o estado fica como indisponível e pode ser tentado de
              novo — nada é simulado.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
