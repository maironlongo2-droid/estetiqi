"use client";

import Link from "next/link";

import { FormEvent, useEffect, useState } from "react";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  birth_date: string | null;
  notes: string | null;
  status: string;
};

type FilterStatus = "" | "active" | "inactive";


function ImportClients({ onImported }: { onImported: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState("");

  async function handlePreview() {
    if (!file) return;

    setLoading(true);
    setMessage("");
    setPreview(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("action", "preview");

    try {
      const response = await fetch("/api/clients/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível analisar o arquivo.");
      }

      setPreview(data);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Erro ao analisar arquivo."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file) return;

    setLoading(true);
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("action", "import");

    try {
      const response = await fetch("/api/clients/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível importar.");
      }

      setMessage(
        `${data.imported} cliente(s) importado(s). ${data.skipped?.length ?? 0} ignorado(s).`
      );

      setPreview(null);
      setFile(null);

      await onImported();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Erro ao importar clientes."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-[#dfe9e3] bg-white px-4 py-2 text-sm font-medium text-[#50655b] transition hover:bg-[#f4f7f5]"
      >
        Importar clientes
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#30463c]">
                  Importar clientes
                </h2>
                <p className="mt-1 text-sm text-[#7a8881]">
                  Envie uma planilha CSV ou Excel para adicionar clientes ao CRM.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setPreview(null);
                  setFile(null);
                  setMessage("");
                }}
                className="text-xl text-[#8a9690]"
              >
                ×
              </button>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#cfdcd5] bg-[#fafcfb] px-6 py-10 text-center transition hover:bg-[#f4f7f5]">
              <span className="text-sm font-medium text-[#50655b]">
                {file ? file.name : "Selecionar arquivo"}
              </span>

              <span className="mt-1 text-xs text-[#8a9690]">
                CSV, XLS ou XLSX — máximo de 10 MB
              </span>

              <input
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setMessage("");
                }}
              />
            </label>

            {file && !preview && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={loading}
                  className="rounded-xl bg-[#6f927f] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#5f816f] disabled:opacity-50"
                >
                  {loading ? "Analisando..." : "Analisar arquivo"}
                </button>
              </div>
            )}

            {preview && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-[#f5f8f6] p-4">
                    <div className="text-xs text-[#7a8881]">Total</div>
                    <div className="mt-1 text-xl font-semibold text-[#30463c]">
                      {preview.total}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#f5f8f6] p-4">
                    <div className="text-xs text-[#7a8881]">Válidos</div>
                    <div className="mt-1 text-xl font-semibold text-[#30463c]">
                      {preview.valid}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#f5f8f6] p-4">
                    <div className="text-xs text-[#7a8881]">Já existentes</div>
                    <div className="mt-1 text-xl font-semibold text-[#30463c]">
                      {preview.existing?.length ?? 0}
                    </div>
                  </div>
                </div>

                {preview.errors?.length > 0 && (
                  <div className="rounded-xl border border-[#eadfd8] bg-[#fffaf7] p-4">
                    <div className="text-sm font-medium text-[#765f50]">
                      Linhas com erro
                    </div>

                    <div className="mt-2 max-h-28 overflow-auto text-xs text-[#8a7060]">
                      {preview.errors.slice(0, 10).map(
                        (item: any, index: number) => (
                          <div key={index}>
                            Linha {item.row}: {item.error}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {preview.existing?.length > 0 && (
                  <div className="rounded-xl border border-[#e5ebe7] p-4">
                    <div className="text-sm font-medium text-[#50655b]">
                      Clientes que já existem
                    </div>

                    <div className="mt-2 max-h-28 overflow-auto text-xs text-[#7a8881]">
                      {preview.existing.slice(0, 10).map(
                        (client: any) => (
                          <div key={client.id}>
                            {client.name}
                            {client.email ? ` — ${client.email}` : ""}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div className="max-h-56 overflow-auto rounded-xl border border-[#e5ebe7]">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-[#f7f9f8] text-xs text-[#7a8881]">
                      <tr>
                        <th className="px-4 py-3">Nome</th>
                        <th className="px-4 py-3">Telefone</th>
                        <th className="px-4 py-3">E-mail</th>
                      </tr>
                    </thead>

                    <tbody>
                      {preview.preview.map(
                        (client: any, index: number) => (
                          <tr
                            key={index}
                            className="border-t border-[#edf1ef]"
                          >
                            <td className="px-4 py-3 text-[#30463c]">
                              {client.name}
                            </td>
                            <td className="px-4 py-3 text-[#7a8881]">
                              {client.phone || "—"}
                            </td>
                            <td className="px-4 py-3 text-[#7a8881]">
                              {client.email || "—"}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="rounded-xl border border-[#dfe9e3] px-4 py-2 text-sm text-[#66756d]"
                  >
                    Escolher outro
                  </button>

                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={loading || preview.valid === 0}
                    className="rounded-xl bg-[#6f927f] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#5f816f] disabled:opacity-50"
                  >
                    {loading ? "Importando..." : "Confirmar importação"}
                  </button>
                </div>
              </div>
            )}

            {message && (
              <div className="mt-4 rounded-xl bg-[#f5f8f6] px-4 py-3 text-sm text-[#50655b]">
                {message}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<FilterStatus>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const limit = 20;

  async function loadClients(
    nextPage = page,
    nextSearch = search,
    nextStatus = status
  ) {
    setLoading(true);

    const params = new URLSearchParams({
      page: String(nextPage),
      limit: String(limit),
      sort: "name",
      order: "asc",
    });

    if (nextSearch.trim()) {
      params.set("search", nextSearch.trim());
    }

    if (nextStatus) {
      params.set("status", nextStatus);
    }

    try {
      const response = await fetch(`/api/clients?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Não foi possível carregar os clientes.");
        return;
      }

      setClients(data.clients || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setError("Não foi possível carregar os clientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      loadClients(1, search, status);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search, status]);

  useEffect(() => {
    loadClients(page, search, status);
  }, [page]);

  async function handleDelete(client: Client) {
    const confirmed = window.confirm(
      `Excluir o cliente "${client.name}"? Esta ação não pode ser desfeita.`
    );

    if (!confirmed) return;

    setError("");

    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Não foi possível excluir o cliente.");
        return;
      }

      await loadClients(page, search, status);
    } catch {
      setError("Não foi possível excluir o cliente.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const response = await fetch("/api/clients", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: form.get("name"),
        phone: form.get("phone"),
        email: form.get("email"),
        cpf: form.get("cpf"),
        birthDate: form.get("birthDate"),
        notes: form.get("notes"),
        status: "active",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Não foi possível cadastrar o cliente.");
      setSaving(false);
      return;
    }

    formElement.reset();
    setShowForm(false);
    setSaving(false);
    setPage(1);
    await loadClients(1, search, status);
  }

  return (
    <main className="min-h-screen bg-[#fbfaf8] text-[#26352f]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Clientes</h1>

            <p className="mt-1 text-sm text-[#78867f]">
              Gerencie sua base de clientes e histórico de relacionamento.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ImportClients
              onImported={() => loadClients(1, search, status)}
            />

            <button
              type="button"
              onClick={() => {
                setShowForm(!showForm);
                setError("");
              }}
              className="rounded-xl bg-[#30463c] px-5 py-3 text-sm font-semibold text-white"
            >
              {showForm ? "Fechar" : "Novo cliente"}
            </button>
          </div>
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
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                  placeholder="Nome completo"
                />
              </label>

              <label>
                <span className="text-sm font-medium">Telefone</span>
                <input
                  name="phone"
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                  placeholder="(21) 99999-9999"
                />
              </label>

              <label>
                <span className="text-sm font-medium">E-mail</span>
                <input
                  name="email"
                  type="email"
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                  placeholder="cliente@email.com"
                />
              </label>

              <label>
                <span className="text-sm font-medium">CPF</span>
                <input
                  name="cpf"
                  maxLength={14}
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                  placeholder="000.000.000-00"
                />
              </label>

              <label>
                <span className="text-sm font-medium">Nascimento</span>
                <input
                  name="birthDate"
                  type="date"
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                />
              </label>

              <label className="md:col-span-2">
                <span className="text-sm font-medium">Observações</span>
                <textarea
                  name="notes"
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-[#dfe9e3] px-4 py-3 outline-none focus:border-[#30463c]"
                  placeholder="Observações sobre o cliente"
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
              {saving ? "Salvando..." : "Cadastrar cliente"}
            </button>
          </form>
        )}

        <section className="mt-6 rounded-2xl border border-[#e4ebe7] bg-white">
          <div className="flex flex-col gap-4 border-b border-[#e4ebe7] p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a9891]">
                ⌕
              </span>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, telefone, e-mail ou CPF"
                className="w-full rounded-xl border border-[#dfe9e3] py-3 pl-11 pr-4 text-sm outline-none focus:border-[#30463c]"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStatus("")}
                className={`rounded-xl px-4 py-2 text-sm ${
                  status === ""
                    ? "bg-[#30463c] font-semibold text-white"
                    : "border border-[#dfe9e3] text-[#66756d]"
                }`}
              >
                Todos
              </button>

              <button
                type="button"
                onClick={() => setStatus("active")}
                className={`rounded-xl px-4 py-2 text-sm ${
                  status === "active"
                    ? "bg-[#30463c] font-semibold text-white"
                    : "border border-[#dfe9e3] text-[#66756d]"
                }`}
              >
                Ativos
              </button>

              <button
                type="button"
                onClick={() => setStatus("inactive")}
                className={`rounded-xl px-4 py-2 text-sm ${
                  status === "inactive"
                    ? "bg-[#30463c] font-semibold text-white"
                    : "border border-[#dfe9e3] text-[#66756d]"
                }`}
              >
                Inativos
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-[#e4ebe7] px-5 py-3">
            <p className="text-sm text-[#78867f]">
              {total} {total === 1 ? "cliente" : "clientes"}
            </p>

            <p className="text-xs text-[#9aa59f]">
              Ordem alfabética
            </p>
          </div>

          {loading ? (
            <p className="p-8 text-sm text-[#78867f]">
              Carregando clientes...
            </p>
          ) : clients.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium">
                {search || status
                  ? "Nenhum cliente encontrado."
                  : "Nenhum cliente cadastrado."}
              </p>

              <p className="mt-1 text-sm text-[#78867f]">
                {search || status
                  ? "Tente alterar a busca ou os filtros."
                  : "Clique em “Novo cliente” para começar."}
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#e4ebe7]">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/app/clientes/${client.id}`}
                        className="truncate font-semibold hover:text-[#6f927f]"
                      >
                        {client.name}
                      </Link>

                      <p className="mt-1 truncate text-sm text-[#78867f]">
                        {client.phone ||
                          client.email ||
                          "Sem contato"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="rounded-full bg-[#edf3ef] px-3 py-1 text-xs font-medium">
                        {client.status === "active"
                          ? "Ativo"
                          : "Inativo"}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDelete(client)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[#e4ebe7] px-5 py-4">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                    className="rounded-xl border border-[#dfe9e3] px-4 py-2 text-sm disabled:opacity-40"
                  >
                    Anterior
                  </button>

                  <span className="text-sm text-[#78867f]">
                    Página {page} de {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-xl border border-[#dfe9e3] px-4 py-2 text-sm disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
