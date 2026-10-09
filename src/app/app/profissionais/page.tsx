"use client";

import { FormEvent, useEffect, useState } from "react";
import { useToast } from "../toast";
import { useProcedureLabels } from "../procedure-labels";
import { prepareImage } from "@/lib/images/downscale";

type Procedure = { id: string; name: string };
type WeeklyInterval = {
  weekday: number;
  startsAt: string;
  endsAt: string;
};
type Exception = {
  date: string;
  kind: "blocked" | "available";
  startsAt: string;
  endsAt: string;
  reason: string;
};
type Professional = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  procedure_ids: string[];
  has_photo: boolean;
  photo_updated_at: string | null;
  weekly: Array<{
    id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
  }>;
  exceptions: Array<{
    id: string;
    exception_date: string;
    kind: "blocked" | "available";
    starts_at: string | null;
    ends_at: string | null;
    reason: string | null;
  }>;
};
type ProfessionalHistory = {
  total: number;
  appointments: Array<{
    id: string;
    starts_at: string;
    status: string;
    price: number | string | null;
    professional_name: string | null;
    client_name: string;
    procedure_name: string | null;
  }>;
};

const weekdays = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

function timeInput(value: string) {
  return value.slice(0, 5);
}

function friendlyError(code: unknown, fallback: string, pluralLower: string) {
  if (code === "INVALID_DATA") {
    return "Confira os dados: informe o nome (mínimo 2 letras) e, se preencher, um e-mail válido.";
  }
  if (code === "PROCEDURE_NOT_FOUND") {
    return `Um dos ${pluralLower} escolhidos não está mais disponível. Atualize a página e tente novamente.`;
  }
  return typeof code === "string" && code ? code : fallback;
}

export default function ProfessionalsPage() {
  const { notifyError } = useToast();
  const labels = useProcedureLabels();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive">("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingProfessionalId, setUpdatingProfessionalId] = useState<string | null>(null);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [active, setActive] = useState(true);
  const [procedureIds, setProcedureIds] = useState<string[]>([]);
  const [availabilityId, setAvailabilityId] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<WeeklyInterval[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [professionalHistory, setProfessionalHistory] = useState<Record<string, ProfessionalHistory>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionKind, setExceptionKind] = useState<"blocked" | "available">("blocked");
  const [exceptionStart, setExceptionStart] = useState("");
  const [exceptionEnd, setExceptionEnd] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");

  async function load() {
    try {
      const [professionalsResponse, proceduresResponse] = await Promise.all([
        fetch("/api/professionals"),
        fetch("/api/procedures?status=active&limit=500"),
      ]);
      const [professionalData, procedureData] = await Promise.all([
        professionalsResponse.json(),
        proceduresResponse.json(),
      ]);
      if (!professionalsResponse.ok) {
        throw new Error(professionalData.error || "Não foi possível carregar profissionais.");
      }
      if (!proceduresResponse.ok) {
        throw new Error(procedureData.error || `Não foi possível carregar ${labels.pluralLower}.`);
      }
      setProfessionals(professionalData);
      setProcedures(procedureData.procedures ?? []);
    } catch (loadError) {
      notifyError(loadError instanceof Error ? loadError.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let current = true;
    Promise.all([
      fetch("/api/professionals").then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Não foi possível carregar profissionais.");
        }
        return data;
      }),
      fetch("/api/procedures?status=active&limit=500").then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `Não foi possível carregar ${labels.pluralLower}.`);
        }
        return data.procedures ?? [];
      }),
    ])
      .then(([professionalData, procedureData]) => {
        if (!current) return;
        setProfessionals(professionalData);
        setProcedures(procedureData);
      })
      .catch((loadError: unknown) => {
        if (!current) return;
        notifyError(
          loadError instanceof Error ? loadError.message : "Erro ao carregar dados."
        );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [notifyError, labels.pluralLower]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setPhone("");
    setEmail("");
    setActive(true);
    setProcedureIds([]);
  }

  async function saveProfessional(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        editingId ? `/api/professionals/${editingId}` : "/api/professionals",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            phone,
            email,
            active,
            procedureIds,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(friendlyError(data.error, "Não foi possível salvar profissional.", labels.pluralLower));
      }
      setNotice(editingId ? "Profissional atualizado." : "Profissional cadastrado.");
      resetForm();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao salvar profissional.");
    } finally {
      setSaving(false);
    }
  }

  function editProfessional(professional: Professional) {
    setEditingId(professional.id);
    setName(professional.name);
    setPhone(professional.phone ?? "");
    setEmail(professional.email ?? "");
    setActive(professional.active);
    setProcedureIds(professional.procedure_ids ?? []);
    setNotice("");
    document.getElementById("professional-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function toggleProfessional(professional: Professional) {
    setError("");
    setNotice("");
    setUpdatingProfessionalId(professional.id);
    try {
      const response = await fetch(`/api/professionals/${professional.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !professional.active }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível alterar o status profissional.");
      }
      setProfessionals((current) =>
        current.map((item) =>
          item.id === professional.id ? { ...item, active: data.active } : item
        )
      );
      if (editingId === professional.id) setActive(data.active);
      setNotice(
        data.active
          ? `${professional.name} voltou a ficar ativa.`
          : `${professional.name} foi inativada. O histórico de atendimentos foi preservado.`
      );
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Não foi possível alterar o status profissional."
      );
    } finally {
      setUpdatingProfessionalId(null);
    }
  }

  async function deleteProfessional(professional: Professional) {
    const confirmed = window.confirm(
      `Excluir permanentemente ${professional.name}? Essa opção só está disponível sem atendimentos relacionados. O histórico operacional não será apagado.`
    );
    if (!confirmed) return;

    setError("");
    setNotice("");
    setUpdatingProfessionalId(professional.id);
    try {
      const response = await fetch(`/api/professionals/${professional.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível excluir profissional.");
      }
      setProfessionals((current) =>
        current.filter((item) => item.id !== professional.id)
      );
      setProfessionalHistory((current) => {
        const remaining = { ...current };
        delete remaining[professional.id];
        return remaining;
      });
      setNotice(`${professional.name} foi excluída permanentemente.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Não foi possível excluir profissional."
      );
    } finally {
      setUpdatingProfessionalId(null);
    }
  }

  async function uploadPhoto(professional: Professional, file: File | null) {
    if (!file) return;
    setError("");
    setNotice("");
    setUploadingPhotoId(professional.id);
    try {
      const blob = await prepareImage(file);
      const form = new FormData();
      form.append("file", blob, "photo");

      const response = await fetch(
        `/api/professionals/${professional.id}/photo`,
        { method: "PUT", body: form }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível enviar a foto.");
      }

      setProfessionals((current) =>
        current.map((item) =>
          item.id === professional.id
            ? {
                ...item,
                has_photo: true,
                photo_updated_at: new Date().toISOString(),
              }
            : item
        )
      );
      setNotice(`Foto de ${professional.name} atualizada.`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Não foi possível enviar a foto."
      );
    } finally {
      setUploadingPhotoId(null);
    }
  }

  async function removePhoto(professional: Professional) {
    setError("");
    setNotice("");
    setUploadingPhotoId(professional.id);
    try {
      const response = await fetch(
        `/api/professionals/${professional.id}/photo`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível remover a foto.");
      }

      setProfessionals((current) =>
        current.map((item) =>
          item.id === professional.id
            ? { ...item, has_photo: false, photo_updated_at: null }
            : item
        )
      );
      setNotice(`Foto de ${professional.name} removida.`);
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Não foi possível remover a foto."
      );
    } finally {
      setUploadingPhotoId(null);
    }
  }

  async function loadProfessionalHistory(professionalId: string) {
    setHistoryLoadingId(professionalId);
    setHistoryError("");
    try {
      const response = await fetch(`/api/professionals/${professionalId}/history`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível carregar o histórico.");
      }
      setProfessionalHistory((current) => ({
        ...current,
        [professionalId]: data,
      }));
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar o histórico."
      );
    } finally {
      setHistoryLoadingId(null);
    }
  }

  function editAvailability(professional: Professional) {
    setAvailabilityId(professional.id);
    setWeekly(
      professional.weekly.map((item) => ({
        weekday: item.weekday,
        startsAt: timeInput(item.starts_at),
        endsAt: timeInput(item.ends_at),
      }))
    );
    setExceptions(
      professional.exceptions.map((item) => ({
        date: String(item.exception_date).slice(0, 10),
        kind: item.kind,
        startsAt: item.starts_at ? timeInput(item.starts_at) : "",
        endsAt: item.ends_at ? timeInput(item.ends_at) : "",
        reason: item.reason ?? "",
      }))
    );
    setError("");
  }

  async function saveAvailability(professionalId: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/professionals/${professionalId}/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekly,
          exceptions: exceptions.map((exception) => ({
            date: exception.date,
            kind: exception.kind,
            startsAt: exception.startsAt || null,
            endsAt: exception.endsAt || null,
            reason: exception.reason,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar disponibilidade.");
      }
      setAvailabilityId(null);
      setNotice("Disponibilidade atualizada.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao salvar disponibilidade.");
    } finally {
      setSaving(false);
    }
  }

  function setWeekdayEnabled(weekday: number, enabled: boolean) {
    setWeekly((current) => {
      const dayIntervals = current.filter((item) => item.weekday === weekday);
      if (!enabled) {
        return current.filter((item) => item.weekday !== weekday);
      }
      if (dayIntervals.length > 0) return current;
      return [...current, { weekday, startsAt: "09:00", endsAt: "17:00" }];
    });
  }

  function addWeeklyInterval(weekday: number) {
    setWeekly((current) => {
      const dayIntervals = current.filter((item) => item.weekday === weekday);
      const lastEnd = dayIntervals.at(-1)?.endsAt ?? "09:00";
      const endTime = lastEnd < "18:00" ? "18:00" : "19:00";
      return [...current, { weekday, startsAt: lastEnd, endsAt: endTime }];
    });
  }

  function addException() {
    if (!exceptionDate) {
      setError("Selecione a data da exceção.");
      return;
    }
    if (exceptionKind === "available" && (!exceptionStart || !exceptionEnd)) {
      setError("Informe o horário inicial e final da disponibilidade excepcional.");
      return;
    }
    setExceptions((current) => [
      ...current,
      {
        date: exceptionDate,
        kind: exceptionKind,
        startsAt: exceptionStart,
        endsAt: exceptionEnd,
        reason: exceptionReason,
      },
    ]);
    setExceptionDate("");
    setExceptionStart("");
    setExceptionEnd("");
    setExceptionReason("");
    setError("");
  }

  const visibleProfessionals = professionals.filter(
    (professional) => professional.active === (statusFilter === "active")
  );
  const editingProfessional = editingId
    ? professionals.find((item) => item.id === editingId) ?? null
    : null;

  return (
    <main className="app-main-min-h bg-[#fbfaf8] px-4 py-7 text-[#26352f] sm:px-6 sm:py-9 lg:px-8">
      <div className="mx-auto max-w-6xl">
    <header className="mb-7">
      <h1 className="text-3xl font-semibold tracking-tight text-[#30463c]">Profissionais</h1>
      <p className="mt-2 text-sm leading-6 text-[#78867f]">
        Cadastre a equipe, os {labels.pluralLower} realizados e os horários de atendimento.
      </p>
        </header>

        {(error || notice) && (
          <p role={error ? "alert" : "status"} className={`mb-5 rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-[#edf7ef] text-[#477152]"}`}>
            {error || notice}
          </p>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
          <form id="professional-form" onSubmit={saveProfessional} className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-[#30463c]">
              {editingId ? "Editar profissional" : "Adicionar profissional"}
            </h2>
            <p className="mt-1 text-sm leading-5 text-[#78867f]">
              Inativar remove a profissional dos novos agendamentos sem apagar atendimentos anteriores.
            </p>
            <div className="mt-4 space-y-3">
              {editingProfessional ? (
                <div>
                  <h3 className="text-sm font-semibold text-[#52635b]">
                    Foto da profissional
                  </h3>
                  <div className="mt-2 flex items-center gap-3">
                    {editingProfessional.has_photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/professionals/${editingProfessional.id}/photo${
                          editingProfessional.photo_updated_at
                            ? `?v=${encodeURIComponent(
                                editingProfessional.photo_updated_at
                              )}`
                            : ""
                        }`}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#eef3f0] text-lg font-semibold text-[#527765]"
                      >
                        {editingProfessional.name.trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-[#dfe9e3] px-3 py-2 text-xs font-semibold text-[#405149] transition hover:bg-[#f4f7f5]">
                        {uploadingPhotoId === editingProfessional.id
                          ? "Enviando..."
                          : editingProfessional.has_photo
                            ? "Trocar foto"
                            : "Adicionar foto"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={uploadingPhotoId === editingProfessional.id}
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            event.target.value = "";
                            void uploadPhoto(editingProfessional, file);
                          }}
                        />
                      </label>
                      {editingProfessional.has_photo ? (
                        <button
                          type="button"
                          onClick={() => void removePhoto(editingProfessional)}
                          disabled={uploadingPhotoId === editingProfessional.id}
                          className="min-h-10 rounded-lg border border-[#e8ceca] px-3 py-2 text-xs font-semibold text-[#8a5149] transition hover:bg-[#fdf5f7] disabled:opacity-50"
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[#78867f]">
                    JPG, PNG ou WebP, até 4 MB. A foto aparece no cartão digital.
                  </p>
                </div>
              ) : null}
              <h3 className="border-t border-[#eef2ef] pt-4 text-sm font-semibold text-[#52635b]">
                Dados de contato
              </h3>
              <label className="block text-sm text-[#52635b]">
                Nome
                <input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-xl border border-[#dfe9e3] p-3" />
              </label>
              <label className="block text-sm text-[#52635b]">
                Telefone
                <input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} className="mt-1 w-full rounded-xl border border-[#dfe9e3] p-3" />
              </label>
              <label className="block text-sm text-[#52635b]">
                E-mail
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-[#dfe9e3] p-3" />
              </label>
              <h3 className="border-t border-[#eef2ef] pt-4 text-sm font-semibold text-[#52635b]">
                {labels.plural} realizados
              </h3>
              <div>
                <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-xl border border-[#eef2ef] p-3">
                  {procedures.length === 0 ? (
                    <p className="text-xs text-[#78867f]">Cadastre {labels.pluralLower} antes de associá-los.</p>
                  ) : procedures.map((procedure) => (
                    <label key={procedure.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={procedureIds.includes(procedure.id)}
                        onChange={(event) => setProcedureIds((current) =>
                          event.target.checked
                            ? [...current, procedure.id]
                            : current.filter((id) => id !== procedure.id)
                        )}
                      />
                      {procedure.name}
                    </label>
                  ))}
                </div>
              </div>
              <h3 className="border-t border-[#eef2ef] pt-4 text-sm font-semibold text-[#52635b]">
                Situação na equipe
              </h3>
              <label className="flex items-start gap-3 rounded-xl bg-[#f7faf8] p-3 text-sm text-[#52635b]">
                <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
                <span>
                  <span className="block font-medium text-[#30463c]">Profissional ativa</span>
                  <span className="mt-1 block text-xs leading-5 text-[#78867f]">
                    {active
                      ? "Pode receber novos agendamentos."
                      : "Não aparecerá para novos agendamentos; os atendimentos anteriores continuam no histórico."}
                  </span>
                </span>
              </label>
              <button disabled={saving} className="w-full rounded-xl bg-[#30463c] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar profissional"}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="w-full rounded-xl border border-[#dfe9e3] px-4 py-3 text-sm">
                  Cancelar edição
                </button>
              )}
            </div>
          </form>

          <section className="space-y-4">
            <div className="flex gap-2 rounded-2xl border border-[#e4ebe7] bg-white p-2">
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                aria-pressed={statusFilter === "active"}
                className={`min-h-10 flex-1 rounded-xl px-4 py-2 text-sm ${
                  statusFilter === "active"
                    ? "bg-[#30463c] font-semibold text-white"
                    : "text-[#66756d]"
                }`}
              >
                Ativos ({professionals.filter((item) => item.active).length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("inactive")}
                aria-pressed={statusFilter === "inactive"}
                className={`min-h-10 flex-1 rounded-xl px-4 py-2 text-sm ${
                  statusFilter === "inactive"
                    ? "bg-[#30463c] font-semibold text-white"
                    : "text-[#66756d]"
                }`}
              >
                Inativos ({professionals.filter((item) => !item.active).length})
              </button>
            </div>
            {loading ? (
              <p className="rounded-2xl border border-[#e4ebe7] bg-white p-6 text-sm text-[#78867f]">Carregando profissionais...</p>
            ) : professionals.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[#cfdcd5] bg-white p-8 text-sm text-[#78867f]">Ainda não há profissionais cadastrados. Cadastre quem atende no seu negócio (pode ser só você) para liberar a agenda.</p>
            ) : visibleProfessionals.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[#cfdcd5] bg-white p-8 text-sm text-[#78867f]">
                {statusFilter === "active"
                  ? "Não há profissionais ativos."
                  : "Não há profissionais inativos."}
              </p>
            ) : visibleProfessionals.map((professional) => {
              const isEditingAvailability = availabilityId === professional.id;
              return (
                <article key={professional.id} className="rounded-2xl border border-[#e4ebe7] bg-white p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {professional.has_photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/professionals/${professional.id}/photo${
                            professional.photo_updated_at
                              ? `?v=${encodeURIComponent(
                                  professional.photo_updated_at
                                )}`
                              : ""
                          }`}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eef3f0] text-sm font-semibold text-[#527765]"
                        >
                          {professional.name.trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="font-semibold text-[#30463c]">{professional.name}</h2>
                          <span className={`rounded-full px-2 py-1 text-xs ${professional.active ? "bg-[#edf7ef] text-[#477152]" : "bg-[#f1f3f2] text-[#66756d]"}`}>
                            {professional.active ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[#78867f]">{professional.phone || "Sem telefone"}{professional.email ? ` · ${professional.email}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => editProfessional(professional)} className="min-h-10 rounded-lg border border-[#dce5e0] px-3 py-2 text-xs font-semibold">Editar dados</button>
                      <button
                        onClick={() => void toggleProfessional(professional)}
                        disabled={updatingProfessionalId === professional.id}
                        className="min-h-10 rounded-lg border border-[#dce5e0] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        {updatingProfessionalId === professional.id
                          ? "Atualizando..."
                          : professional.active
                            ? "Inativar"
                            : "Reativar"}
                      </button>
                      <button onClick={() => editAvailability(professional)} className="min-h-10 rounded-lg bg-[#edf3ef] px-3 py-2 text-xs font-semibold text-[#30463c]">
                        {isEditingAvailability ? "Disponibilidade aberta" : "Horários e exceções"}
                      </button>
                      {!professional.active && (
                        <button
                          onClick={() => void deleteProfessional(professional)}
                          disabled={updatingProfessionalId === professional.id}
                          className="min-h-10 rounded-lg border border-[#e8ceca] px-3 py-2 text-xs font-semibold text-[#8a5149] disabled:opacity-50"
                        >
                          Excluir permanentemente
                        </button>
                      )}
                    </div>
                  </div>

                  <details className="mt-4 border-t border-[#eef2ef] pt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[#52635b]">
                      Ver dados e histórico
                    </summary>
                    <div className="mt-3 space-y-3">
                      <p className="text-sm text-[#78867f]">
                        {labels.plural}: {professional.procedure_ids.length
                          ? professional.procedure_ids.map((id) => procedures.find((item) => item.id === id)?.name).filter(Boolean).join(", ")
                          : "Ainda não associados"}
                      </p>
                      <p className="text-sm text-[#78867f]">
                        Disponibilidade semanal: {professional.weekly.length
                          ? [...new Set(professional.weekly.map((item) => weekdays.find((day) => day.value === item.weekday)?.label).filter(Boolean))].join(", ")
                          : "não configurada"}
                      </p>
                      <div className="rounded-xl bg-[#f7faf8] p-3">
                        <p className="text-sm font-medium text-[#30463c]">
                          Histórico de atendimentos
                        </p>
                        {professionalHistory[professional.id] ? (
                          <>
                            <p className="mt-1 text-xs text-[#78867f]">
                              {professionalHistory[professional.id].total} atendimentos relacionados
                              {professionalHistory[professional.id].total > professionalHistory[professional.id].appointments.length
                                ? " · mostrando os 50 mais recentes"
                                : ""}
                            </p>
                            {professionalHistory[professional.id].appointments.length > 0 ? (
                              <ul className="mt-2 divide-y divide-[#e4ebe7]">
                                {professionalHistory[professional.id].appointments.map((appointment) => (
                                  <li key={appointment.id} className="py-2 text-sm">
                                    <span className="font-medium text-[#30463c]">{appointment.client_name}</span>
                                    <span className="text-[#78867f]">
                                      {" · "}{appointment.procedure_name ?? `${labels.singular} não informado`}
                                      {" · "}{new Date(appointment.starts_at).toLocaleDateString("pt-BR")}
                                      {" · "}{appointment.status === "completed" ? "Concluído" : appointment.status === "no_show" ? "Não compareceu" : appointment.status === "cancelled" ? "Cancelado" : appointment.status === "confirmed" ? "Confirmado" : "Agendado"}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-1 text-xs text-[#78867f]">Nenhum atendimento relacionado.</p>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void loadProfessionalHistory(professional.id)}
                            disabled={historyLoadingId === professional.id}
                            className="mt-2 min-h-10 rounded-lg border border-[#dce5e0] px-3 py-2 text-xs font-semibold text-[#30463c] disabled:opacity-50"
                          >
                            {historyLoadingId === professional.id
                              ? "Carregando histórico..."
                              : "Consultar atendimentos"}
                          </button>
                        )}
                        {historyError && historyLoadingId === null && (
                          <p role="alert" className="mt-2 text-xs text-red-700">{historyError}</p>
                        )}
                      </div>
                      {!professional.active && (
                        <p className="text-xs leading-5 text-[#78867f]">
                          A exclusão permanente só é permitida quando não há atendimentos relacionados. Quando existe histórico, o cadastro deve permanecer inativo.
                        </p>
                      )}
                    </div>
                  </details>

                  {isEditingAvailability && (
                    <div className="mt-5 border-t border-[#e4ebe7] pt-5">
                      <h3 className="font-medium text-[#30463c]">Horários semanais</h3>
                      <div className="mt-3 space-y-3">
                        {weekdays.map((day) => {
                          const intervals = weekly
                            .map((interval, index) => ({ interval, index }))
                            .filter(({ interval }) => interval.weekday === day.value);
                          return (
                            <section key={day.value} className="rounded-xl border border-[#eef2ef] p-3">
                              <label className="flex min-h-10 items-center gap-3 text-sm font-medium text-[#30463c]">
                                <input
                                  type="checkbox"
                                  checked={intervals.length > 0}
                                  onChange={(event) => setWeekdayEnabled(day.value, event.target.checked)}
                                />
                                {day.label} — {intervals.length > 0 ? "Trabalha" : "Não trabalha"}
                              </label>
                              {intervals.map(({ interval, index }) => (
                                <div key={`${day.value}-${index}`} className="mt-2 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                                  <input
                                    aria-label={`${day.label} início do intervalo ${index + 1}`}
                                    type="time"
                                    value={interval.startsAt}
                                    onChange={(event) => setWeekly((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, startsAt: event.target.value } : item))}
                                    className="min-w-0 rounded-lg border border-[#dfe9e3] p-2 text-sm"
                                  />
                                  <span className="text-xs text-[#78867f]">até</span>
                                  <input
                                    aria-label={`${day.label} fim do intervalo ${index + 1}`}
                                    type="time"
                                    value={interval.endsAt}
                                    onChange={(event) => setWeekly((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, endsAt: event.target.value } : item))}
                                    className="min-w-0 rounded-lg border border-[#dfe9e3] p-2 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setWeekly((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                                    aria-label={`Remover horário de ${day.label}`}
                                    className="min-h-10 min-w-10 text-red-700"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              {intervals.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => addWeeklyInterval(day.value)}
                                  className="mt-2 min-h-10 text-sm font-semibold text-[#527765]"
                                >
                                  + Adicionar intervalo
                                </button>
                              )}
                            </section>
                          );
                        })}
                      </div>

                      <h3 className="mt-6 font-medium text-[#30463c]">Exceções e bloqueios</h3>
                      <p className="mt-1 text-xs text-[#78867f]">Bloqueio sem horário fecha o dia; disponibilidade exige um intervalo.</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} className="rounded-lg border border-[#dfe9e3] p-2 text-sm" />
                        <select value={exceptionKind} onChange={(event) => setExceptionKind(event.target.value as "blocked" | "available")} className="rounded-lg border border-[#dfe9e3] p-2 text-sm">
                          <option value="blocked">Indisponível / bloqueio</option>
                          <option value="available">Disponibilidade excepcional</option>
                        </select>
                        <input type="time" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} className="rounded-lg border border-[#dfe9e3] p-2 text-sm" />
                        <input type="time" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} className="rounded-lg border border-[#dfe9e3] p-2 text-sm" />
                        <input value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} placeholder="Motivo (ex.: férias, feriado)" maxLength={180} className="rounded-lg border border-[#dfe9e3] p-2 text-sm sm:col-span-2" />
                      </div>
                      <button type="button" onClick={addException} className="mt-2 text-sm font-semibold text-[#527765]">+ Adicionar exceção</button>
                      <div className="mt-3 space-y-2">
                        {exceptions.map((exception, index) => (
                          <div key={`${exception.date}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f7faf8] px-3 py-2 text-sm">
                            <span>
                              {new Date(`${exception.date}T12:00:00`).toLocaleDateString("pt-BR")} · {exception.kind === "available" ? "Disponível" : "Bloqueado"}
                              {exception.startsAt && ` ${exception.startsAt}–${exception.endsAt}`}
                              {exception.reason && ` · ${exception.reason}`}
                            </span>
                            <button type="button" onClick={() => setExceptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-semibold text-red-700">Remover</button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button type="button" disabled={saving} onClick={() => void saveAvailability(professional.id)} className="rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                          {saving ? "Salvando..." : "Salvar horários"}
                        </button>
                        <button type="button" onClick={() => setAvailabilityId(null)} className="rounded-xl border border-[#dfe9e3] px-4 py-2 text-sm">Fechar</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </div>
      </div>
    </main>
  );
}
