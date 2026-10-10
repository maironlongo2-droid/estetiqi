"use client";

import { FormEvent, useEffect, useState } from "react";
import { useToast } from "./toast";
import { MAX_PROTOCOL_BYTES, formatProtocolSize } from "@/lib/protocols/limits";
import {
  PROTOCOL_KIND_LABELS,
  type ProtocolKind,
} from "@/lib/protocols/kinds";

// Protocolos de procedimento (PDF) dentro da tela de Procedimentos.
//
// Honestidade: quando a migration 034 ainda não foi aplicada no banco, a tela
// explica isso e não permite upload (nada é simulado). O estado de cada envio é o
// que o provedor realmente informou — "enviado" só aparece com confirmação da
// Meta; sem WhatsApp conectado o registro fica "indisponível" com o motivo.

type DeliveryRecord = {
  id: string;
  appointmentId: string | null;
  clientName: string | null;
  appointmentStartsAt: string | null;
  triggerType: string;
  status: string;
  detail: string | null;
  attempts: number;
  lastAttemptAt: string | null;
};

type ProtocolRecord = {
  id: string;
  name: string;
  description: string | null;
  protocolKind: string;
  autoSend: boolean;
  sizeBytes: number;
  version: number;
  updatedAt: string | null;
  deliveries: DeliveryRecord[];
};

type ProtocolListResponse = {
  protocols?: ProtocolRecord[];
  schemaReady?: boolean;
  whatsapp?: { ready: boolean; message: string };
  error?: string;
  message?: string;
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: "Em processamento",
  sent: "Enviado",
  failed: "Falhou",
  unavailable: "Indisponível",
};

const DELIVERY_TRIGGER_LABELS: Record<string, string> = {
  pre_appointment: "Após confirmar",
  post_appointment: "Após concluir",
};

function deliveryBadgeClass(status: string) {
  if (status === "sent") return "bg-[#e6f4ec] text-[#3d6b52]";
  if (status === "failed") return "bg-[#f7e8ec] text-[#8a4356]";
  return "bg-[#f2efe6] text-[#7a6a4b]";
}

function dateTimeLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ProtocolManager({
  procedureId,
  procedureName,
}: {
  procedureId: string;
  procedureName: string;
}) {
  const { notifyError, notifySuccess } = useToast();

  const [protocols, setProtocols] = useState<ProtocolRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [schemaReady, setSchemaReady] = useState(true);
  const [whatsapp, setWhatsapp] = useState<{
    ready: boolean;
    message: string;
  } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [protocolKind, setProtocolKind] = useState<ProtocolKind>("pre");
  const [autoSend, setAutoSend] = useState(true);

  // Carga dos protocolos do procedimento. O padrão é o mesmo usado em outras
  // telas do produto (efeito com fetch + then): os setState acontecem apenas
  // depois da resposta, nunca de forma síncrona no corpo do efeito.
  // `reloadKey` dispara a releitura quando a pessoa pede para tentar novamente.
  useEffect(() => {
    let active = true;

    fetch(`/api/procedures/${procedureId}/protocols`)
      .then(async (response) => {
        const data = (await response
          .json()
          .catch(() => null)) as ProtocolListResponse | null;

        if (!response.ok) {
          throw new Error(
            data?.error || "Não foi possível carregar os protocolos."
          );
        }

        return data;
      })
      .then((data) => {
        if (!active) return;
        setProtocols(Array.isArray(data?.protocols) ? data.protocols : []);
        setSchemaReady(data?.schemaReady !== false);
        setWhatsapp(data?.whatsapp ?? null);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os protocolos."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [procedureId, reloadKey]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      notifyError("Selecione o arquivo PDF do protocolo.");
      return;
    }

    // Validação no cliente (o servidor revalida tipo real, assinatura e tamanho).
    const looksLikePdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!looksLikePdf) {
      notifyError("Envie um arquivo PDF. Outros formatos não são aceitos.");
      return;
    }
    if (file.size > MAX_PROTOCOL_BYTES) {
      notifyError("Arquivo muito grande. Envie um PDF de até 5 MB.");
      return;
    }

    const name = String(form.get("name") ?? "").trim();
    if (name.length < 2) {
      notifyError("Informe um nome para o protocolo.");
      return;
    }

    setUploading(true);
    try {
      const payload = new FormData();
      payload.append("file", file);
      payload.append("name", name);
      payload.append("description", String(form.get("description") ?? ""));
      payload.append("protocolKind", protocolKind);
      payload.append("autoSend", String(autoSend));

      const response = await fetch(`/api/procedures/${procedureId}/protocols`, {
        method: "POST",
        body: payload,
      });
      const data = (await response.json().catch(() => null)) as
        | ProtocolListResponse
        | null;

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Não foi possível salvar o protocolo."
        );
      }

      setProtocols(Array.isArray(data?.protocols) ? data.protocols : []);
      setSelectedFileName("");
      setAutoSend(true);
      formElement.reset();
      notifySuccess(
        autoSend
          ? "Protocolo salvo. O envio automático vai tentar pelo WhatsApp conectado."
          : "Protocolo salvo. O envio automático ficou desligado."
      );
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o protocolo."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleToggleAutoSend(protocol: ProtocolRecord) {
    setBusyId(protocol.id);
    try {
      const response = await fetch(
        `/api/procedures/${procedureId}/protocols/${protocol.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoSend: !protocol.autoSend }),
        }
      );
      const data = (await response.json().catch(() => null)) as
        | ProtocolListResponse
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error || "Não foi possível atualizar o protocolo."
        );
      }

      setProtocols(Array.isArray(data?.protocols) ? data.protocols : []);
      notifySuccess(
        protocol.autoSend
          ? "Envio automático desligado."
          : "Envio automático ligado."
      );
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o protocolo."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(protocol: ProtocolRecord) {
    const confirmed = window.confirm(
      `Remover o protocolo "${protocol.name}"? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setBusyId(protocol.id);
    try {
      const response = await fetch(
        `/api/procedures/${procedureId}/protocols/${protocol.id}`,
        { method: "DELETE" }
      );
      const data = (await response.json().catch(() => null)) as
        | ProtocolListResponse
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível remover o protocolo.");
      }

      setProtocols(Array.isArray(data?.protocols) ? data.protocols : []);
      notifySuccess("Protocolo removido.");
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Não foi possível remover o protocolo."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetry(protocol: ProtocolRecord, delivery: DeliveryRecord) {
    if (!delivery.appointmentId) return;

    setRetryingId(delivery.id);
    try {
      const response = await fetch(
        `/api/procedures/${procedureId}/protocols/${protocol.id}/deliveries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointmentId: delivery.appointmentId,
            trigger: delivery.triggerType,
          }),
        }
      );
      const data = (await response.json().catch(() => null)) as
        | (ProtocolListResponse & {
            outcome?: { status: string; detail: string };
          })
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error || "Não foi possível tentar o envio novamente."
        );
      }

      setProtocols(Array.isArray(data?.protocols) ? data.protocols : []);

      const outcome = data?.outcome;
      if (outcome?.status === "sent") {
        notifySuccess(outcome.detail);
      } else {
        notifyError(outcome?.detail || "O envio não foi confirmado.");
      }
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Não foi possível tentar o envio novamente."
      );
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-[#e4ebe7] bg-[#fbfdfc] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#30463c]">
            Protocolos de {procedureName}
          </p>
          <p className="mt-0.5 text-xs text-[#78867f]">
            PDFs da sua clínica (orientações e cuidados). Enviados pelo WhatsApp
            oficial quando ele estiver conectado.
          </p>
        </div>
        <span className="rounded-full bg-[#edf3ef] px-2.5 py-1 text-[11px] font-semibold text-[#50655b]">
          Até 5 MB por PDF
        </span>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-[#78867f]">Carregando protocolos...</p>
      ) : loadError ? (
        <div className="mt-3 rounded-xl border border-[#f0d6dc] bg-[#fdf5f7] p-3">
          <p role="alert" className="text-sm text-[#8a4356]">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadKey((key) => key + 1);
            }}
            className="mt-2 min-h-10 rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-xs font-semibold text-[#405149]"
          >
            Tentar novamente
          </button>
        </div>
      ) : !schemaReady ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">
            Anexo de PDF aguardando aplicação da migration.
          </p>
          <p className="mt-1">
            A estrutura <code>034_procedure_protocols.sql</code> ainda não foi
            aplicada neste ambiente, por isso esta tela não faz upload nem
            mantém documentos — nada é simulado.
          </p>
        </div>
      ) : (
        <>
          <form
            onSubmit={handleUpload}
            className="mt-4 rounded-xl border border-[#e4ebe7] bg-white p-4"
          >
            <p className="text-sm font-semibold text-[#30463c]">
              Anexar protocolo em PDF
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-[#6d7d75]">Arquivo PDF</span>
                <input
                  name="file"
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  onChange={(event) =>
                    setSelectedFileName(event.target.files?.[0]?.name ?? "")
                  }
                  className="mt-1 block w-full rounded-xl border border-[#d5e2da] px-3 py-2 text-sm"
                />
                {selectedFileName ? (
                  <span className="mt-1 block truncate text-xs text-[#78867f]">
                    {selectedFileName}
                  </span>
                ) : null}
              </label>

              <label className="text-sm">
                <span className="text-[#6d7d75]">
                  Nome exibido para a equipe
                </span>
                <input
                  name="name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={160}
                  placeholder="Ex.: Orientações antes da limpeza de pele"
                  className="mt-1 block w-full rounded-xl border border-[#d5e2da] px-3 py-2 text-sm"
                />
              </label>

              <label className="text-sm">
                <span className="text-[#6d7d75]">Momento do protocolo</span>
                <select
                  value={protocolKind}
                  onChange={(event) =>
                    setProtocolKind(event.target.value as ProtocolKind)
                  }
                  className="mt-1 block w-full rounded-xl border border-[#d5e2da] px-3 py-2 text-sm"
                >
                  <option value="pre">{PROTOCOL_KIND_LABELS.pre}</option>
                  <option value="post">{PROTOCOL_KIND_LABELS.post}</option>
                </select>
              </label>

              <label className="text-sm">
                <span className="text-[#6d7d75]">Mensagem (opcional)</span>
                <input
                  name="description"
                  type="text"
                  maxLength={500}
                  placeholder="Ex.: Leia com atenção antes do atendimento."
                  className="mt-1 block w-full rounded-xl border border-[#d5e2da] px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="mt-3 flex items-start gap-3 text-sm text-[#405149]">
              <input
                type="checkbox"
                checked={autoSend}
                onChange={(event) => setAutoSend(event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                {protocolKind === "pre"
                  ? "Enviar automaticamente após a confirmação do agendamento"
                  : "Enviar automaticamente após o atendimento ser concluído"}
                <span className="mt-0.5 block text-xs text-[#8a9891]">
                  O envio usa o WhatsApp oficial da sua conta. Sem um número
                  conectado, o envio fica registrado como indisponível — nada é
                  simulado.
                </span>
              </span>
            </label>

            <button
              type="submit"
              disabled={uploading}
              className="mt-3 min-h-11 rounded-xl bg-[#527765] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#456957] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? "Enviando..." : "Salvar protocolo"}
            </button>
          </form>

          {whatsapp && !whatsapp.ready ? (
            <p className="mt-3 rounded-xl border border-[#f0e3c2] bg-[#fdf8ec] px-3 py-2 text-xs text-[#7a6a4b]">
              {whatsapp.message} O protocolo continua salvo e o envio pode ser
              tentado novamente quando o número for conectado.
            </p>
          ) : null}

          {protocols.length === 0 ? (
            <p className="mt-3 text-sm text-[#78867f]">
              Nenhum protocolo anexado ainda. Os PDFs da sua clínica ficam
              associados a este item e podem ser enviados automaticamente.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {protocols.map((protocol) => (
                <li
                  key={protocol.id}
                  className="rounded-xl border border-[#e4ebe7] bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#30463c]">
                        {protocol.name}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-[#edf3ef] px-2 py-0.5 font-medium text-[#50655b]">
                          {PROTOCOL_KIND_LABELS[
                            protocol.protocolKind as ProtocolKind
                          ] ?? protocol.protocolKind}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${
                            protocol.autoSend
                              ? "bg-[#e6f4ec] text-[#3d6b52]"
                              : "bg-[#f1f3f2] text-[#66756d]"
                          }`}
                        >
                          {protocol.autoSend
                            ? "Envio automático ligado"
                            : "Envio automático desligado"}
                        </span>
                        <span className="text-[#78867f]">
                          {formatProtocolSize(protocol.sizeBytes)}
                        </span>
                        {protocol.description ? (
                          <span className="truncate text-[#78867f]">
                            · {protocol.description}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/procedures/${procedureId}/protocols/${protocol.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-10 items-center rounded-lg border border-[#dce5e0] px-3 py-2 text-xs font-semibold text-[#30463c]"
                      >
                        Abrir PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleToggleAutoSend(protocol)}
                        disabled={busyId === protocol.id}
                        className="min-h-10 rounded-lg border border-[#dce5e0] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        {protocol.autoSend ? "Desligar envio" : "Ligar envio"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(protocol)}
                        disabled={busyId === protocol.id}
                        className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                      >
                        Remover
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-[#eef2ef] pt-3">
                    <p className="text-xs font-semibold text-[#78867f]">
                      Últimos envios
                    </p>
                    {protocol.deliveries.length === 0 ? (
                      <p className="mt-1 text-xs text-[#8a9891]">
                        Nenhum envio registrado ainda. O envio automático
                        acontece quando o agendamento é confirmado (pré) ou o
                        atendimento é concluído (pós).
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {protocol.deliveries.map((delivery) => (
                          <li
                            key={delivery.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <span className="flex flex-wrap items-center gap-2 text-[#50655b]">
                              <span
                                className={`rounded-full px-2 py-0.5 font-semibold ${deliveryBadgeClass(
                                  delivery.status
                                )}`}
                              >
                                {DELIVERY_STATUS_LABELS[delivery.status] ??
                                  delivery.status}
                              </span>
                              <span>
                                {DELIVERY_TRIGGER_LABELS[
                                  delivery.triggerType
                                ] ?? delivery.triggerType}
                              </span>
                              {delivery.clientName ? (
                                <span>· {delivery.clientName}</span>
                              ) : null}
                              {delivery.appointmentStartsAt ? (
                                <span>
                                  · {dateTimeLabel(delivery.appointmentStartsAt)}
                                </span>
                              ) : null}
                              {delivery.attempts > 1 ? (
                                <span>· {delivery.attempts} tentativas</span>
                              ) : null}
                            </span>
                            <span className="flex flex-wrap items-center gap-2">
                              {delivery.detail ? (
                                <span className="max-w-[20rem] text-[#8a9891]">
                                  {delivery.detail}
                                </span>
                              ) : null}
                              {delivery.status !== "sent" &&
                              delivery.appointmentId ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleRetry(protocol, delivery)
                                  }
                                  disabled={retryingId === delivery.id}
                                  className="min-h-8 rounded-lg border border-[#dce5e0] px-2 py-1 font-semibold text-[#30463c] disabled:opacity-50"
                                >
                                  {retryingId === delivery.id
                                    ? "Tentando..."
                                    : "Tentar novamente"}
                                </button>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
