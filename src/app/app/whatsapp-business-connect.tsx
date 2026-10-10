"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "./toast";
import type { OrganizationWhatsAppIntegration } from "@/lib/communication/whatsapp-integration";
import type { EmbeddedSignupPublicConfig } from "@/lib/communication/whatsapp-embedded-signup";

// Conexão oficial do WhatsApp Business (Meta) via Embedded Signup.
//
// HONESTIDADE:
// - Nada é conectado sem a profissional concluir o fluxo da própria Meta.
// - O `code` devolvido pelo fluxo vai para o SERVIDOR, que troca por token e o
//   grava CIFRADO. O navegador nunca vê nem guarda o token.
// - Se o banco ainda não tiver a estrutura (migrations) ou a chave de
//   criptografia não estiver configurada, o servidor recusa a conexão e aqui
//   mostramos o motivo exato — nunca fingimos que conectou.
// - Exigir DONO da organização é responsabilidade do servidor. Sem permissão, a
//   API responde 403 e mostramos a mensagem devolvida.

const FB_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const FB_SDK_SCRIPT_ID = "facebook-jssdk";
// A Meta envia os eventos do Embedded Signup por postMessage a partir destes
// domínios. Qualquer outra origem é ignorada: não lemos dados de terceiros.
const FB_TRUSTED_ORIGINS = [
  "https://www.facebook.com",
  "https://web.facebook.com",
];

type FacebookLoginResponse = {
  status?: string;
  authResponse?: { code?: string } | null;
};

type FacebookSdk = {
  init: (options: {
    appId: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
    version: string;
  }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: Record<string, unknown>
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

// Dados que o fluxo da Meta devolve por postMessage: o número escolhido e a
// conta comercial (WABA). Usados ao concluir a autorização.
type SignupSelection = {
  phoneNumberId: string;
  businessAccountId: string | null;
};

type ConnectErrorBody = { error?: string; code?: string };

// Textos para os códigos técnicos que o servidor devolve. Quando o servidor
// manda uma mensagem própria, ela tem prioridade.
const CONNECT_ERROR_HINTS: Record<string, string> = {
  SCHEMA_PENDING:
    "A estrutura de conexão ainda não foi aplicada no banco (migrations pendentes). Nada foi gravado.",
  KEY_MISSING:
    "A chave de criptografia das credenciais não está configurada no servidor. Nada foi gravado.",
  PLATFORM_NOT_CONFIGURED:
    "A integração oficial da Meta não está configurada no servidor.",
  PHONE_NOT_AUTHORIZED:
    "A Meta não confirmou que este número pertence à autorização concedida.",
  PHONE_NUMBER_IN_USE: "Este número já está conectado a outra organização.",
};

function describeConnectFailure(body: ConnectErrorBody | null) {
  if (body) {
    if (body.code && CONNECT_ERROR_HINTS[body.code]) {
      return CONNECT_ERROR_HINTS[body.code];
    }
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  }
  return "Não foi possível concluir a conexão do WhatsApp.";
}

function formatMoment(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

export function WhatsAppBusinessConnect({
  organization,
  embeddedSignup,
  onChanged,
}: {
  organization: OrganizationWhatsAppIntegration | null;
  embeddedSignup: EmbeddedSignupPublicConfig | null;
  onChanged: () => void | Promise<void>;
}) {
  const { notifyError, notifySuccess } = useToast();
  const [sdkStatus, setSdkStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [flowMessage, setFlowMessage] = useState("");
  const selectionRef = useRef<SignupSelection | null>(null);

  const appId = embeddedSignup?.appId ?? null;
  const configId = embeddedSignup?.configId ?? null;
  const graphVersion = embeddedSignup?.graphVersion ?? "v21.0";
  const missing = embeddedSignup?.missing ?? [];
  const signupEnabled = Boolean(embeddedSignup?.enabled && appId && configId);

  // Carrega o SDK JS da Meta apenas quando o fluxo está realmente disponível.
  useEffect(() => {
    if (!signupEnabled || !appId) return;
    let cancelled = false;

    function markReady() {
      if (!cancelled) setSdkStatus("ready");
    }

    function markLoading() {
      if (!cancelled) setSdkStatus("loading");
    }

    function initSdk() {
      const sdk = window.FB;
      if (!sdk || !appId) return;
      sdk.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: graphVersion,
      });
      markReady();
    }

    if (window.FB) {
      initSdk();
      return () => {
        cancelled = true;
      };
    }

    markLoading();
    window.fbAsyncInit = initSdk;
    if (!document.getElementById(FB_SDK_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = FB_SDK_SCRIPT_ID;
      script.src = FB_SDK_SRC;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.onerror = () => {
        if (!cancelled) setSdkStatus("error");
      };
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [signupEnabled, appId, graphVersion]);

  // O Embedded Signup devolve o número escolhido por postMessage. Só aceitamos
  // mensagens vindas da Meta.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!FB_TRUSTED_ORIGINS.includes(event.origin)) return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;
      const record = payload as Record<string, unknown>;
      if (record.type !== "WA_EMBEDDED_SIGNUP") return;
      const data = (record.data ?? {}) as Record<string, unknown>;
      const eventName = typeof record.event === "string" ? record.event : "";

      if (eventName === "CANCEL") {
        setFlowMessage(
          "O fluxo da Meta foi cancelado antes de concluir a conexão. Nada foi gravado."
        );
        return;
      }
      if (eventName === "ERROR") {
        setFlowMessage(
          typeof data.error_message === "string" && data.error_message
            ? `A Meta informou um erro: ${data.error_message}`
            : "A Meta informou um erro durante o fluxo de conexão."
        );
        return;
      }

      const phoneNumberId =
        typeof data.phone_number_id === "string" ? data.phone_number_id : null;
      if (phoneNumberId) {
        selectionRef.current = {
          phoneNumberId,
          businessAccountId:
            typeof data.waba_id === "string" ? data.waba_id : null,
        };
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const startSignup = useCallback(() => {
    const sdk = window.FB;
    if (!appId || !configId) return;
    if (!sdk || sdkStatus !== "ready") {
      notifyError(
        "O SDK da Meta ainda não terminou de carregar. Aguarde alguns segundos e tente novamente."
      );
      return;
    }
    selectionRef.current = null;
    setFlowMessage("");
    setConnecting(true);
    sdk.login(
      async (response) => {
        const code = response?.authResponse?.code ?? null;
        if (!code) {
          setConnecting(false);
          setFlowMessage(
            "O fluxo da Meta não devolveu a autorização. A conexão não foi concluída."
          );
          return;
        }
        const selection = selectionRef.current;
        if (!selection?.phoneNumberId) {
          setConnecting(false);
          setFlowMessage(
            "A Meta não informou qual número foi escolhido. Repita o fluxo e selecione o número desejado."
          );
          return;
        }
        try {
          const apiResponse = await fetch(
            "/api/communication/whatsapp/connect",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code,
                phoneNumberId: selection.phoneNumberId,
                businessAccountId: selection.businessAccountId,
              }),
            }
          );
          const body = (await apiResponse
            .json()
            .catch(() => null)) as ConnectErrorBody | null;
          if (!apiResponse.ok) {
            setFlowMessage(describeConnectFailure(body));
            return;
          }
          setFlowMessage("");
          notifySuccess("WhatsApp oficial conectado.");
          await onChanged();
        } catch {
          setFlowMessage(
            "Não foi possível concluir a conexão. Verifique sua internet e tente novamente."
          );
        } finally {
          setConnecting(false);
          selectionRef.current = null;
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      }
    );
  }, [appId, configId, sdkStatus, notifyError, notifySuccess, onChanged]);

  const handleDisconnect = useCallback(async () => {
    const confirmed = window.confirm(
      "Desconectar o número oficial do WhatsApp desta organização? O envio pela API oficial será interrompido."
    );
    if (!confirmed) return;
    setDisconnecting(true);
    setFlowMessage("");
    try {
      const response = await fetch("/api/communication/whatsapp/disconnect", {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as
        | ConnectErrorBody
        | null;
      if (!response.ok) {
        setFlowMessage(describeConnectFailure(body));
        return;
      }
      notifySuccess("Número oficial desconectado.");
      await onChanged();
    } catch {
      setFlowMessage(
        "Não foi possível desconectar agora. Verifique sua internet e tente novamente."
      );
    } finally {
      setDisconnecting(false);
    }
  }, [notifySuccess, onChanged]);

  return (
    <div className="mt-4 rounded-xl border border-[#e4ebe7] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#78867f]">
          Conexão oficial (Embedded Signup)
        </p>
        <span
          className={
            organization?.connected
              ? "rounded-full bg-[#edf7ef] px-2.5 py-1 text-xs font-semibold text-[#477152]"
              : "rounded-full bg-[#f4f7f5] px-2.5 py-1 text-xs font-semibold text-[#52635b]"
          }
        >
          {organization?.statusLabel ?? "Verificando..."}
        </span>
      </div>

      {!organization && (
        <p className="mt-2 text-sm text-[#78867f]">
          Verificando o estado da conexão desta organização...
        </p>
      )}

      {organization && !organization.ready && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">
            Estrutura de conexão ainda não aplicada no banco.
          </p>
          <p className="mt-1">
            O Embedded Signup guarda o número e o token (cifrado) no banco.
            Enquanto as migrations de conexão não estiverem aplicadas, o servidor
            recusa a conexão: nada é gravado e o envio pela API oficial fica
            indisponível.
          </p>
        </div>
      )}

      {organization?.ready && (
        <>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-[#78867f]">
                Número conectado
              </dt>
              <dd className="mt-0.5 text-[#30463c]">
                {organization.displayPhoneNumber ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#78867f]">
                Nome verificado
              </dt>
              <dd className="mt-0.5 text-[#30463c]">
                {organization.verifiedName ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#78867f]">
                Identificador do número
              </dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-[#30463c]">
                {organization.phoneNumberId ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#78867f]">
                Conta comercial (WABA)
              </dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-[#30463c]">
                {organization.businessAccountId ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#78867f]">
                Token armazenado (cifrado)
              </dt>
              <dd className="mt-0.5 text-[#30463c]">
                {organization.hasStoredToken ? "Sim" : "Não"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#78867f]">
                Token expira em
              </dt>
              <dd className="mt-0.5 text-[#30463c]">
                {organization.tokenExpiresAt
                  ? formatMoment(organization.tokenExpiresAt)
                  : "sem data informada pela Meta"}
                {organization.tokenExpired ? " (expirado)" : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#78867f]">
                Webhook configurado
              </dt>
              <dd className="mt-0.5 text-[#30463c]">
                {organization.webhookConfigured ? "Sim" : "Não"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#78867f]">
                Última notificação recebida
              </dt>
              <dd className="mt-0.5 text-[#30463c]">
                {formatMoment(organization.lastWebhookAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#78867f]">
                Conectado em
              </dt>
              <dd className="mt-0.5 text-[#30463c]">
                {formatMoment(organization.connectedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#78867f]">
                Última verificação
              </dt>
              <dd className="mt-0.5 text-[#30463c]">
                {formatMoment(organization.lastCheckedAt)}
              </dd>
            </div>
          </dl>

          {organization.tokenExpired && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            >
              A autorização da Meta expirou. Reconecte o número para voltar a
              enviar pela API oficial.
            </p>
          )}

          {organization.lastError && (
            <p className="mt-3 rounded-xl bg-[#fdf3f2] p-3 text-sm text-red-700">
              Último erro registrado pela Meta: {organization.lastError}
            </p>
          )}

          {organization.connected && !organization.webhookConfigured && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              O webhook ainda não foi marcado como configurado. Sem ele, as
              mensagens que as clientes enviam não chegam ao sistema (o envio pela
              API oficial continua funcionando).
            </p>
          )}
        </>
      )}

      {flowMessage && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
        >
          {flowMessage}
        </p>
      )}

      {organization?.ready && !organization.connected && signupEnabled && (
        <div className="mt-3">
          <button
            type="button"
            onClick={startSignup}
            disabled={connecting || sdkStatus !== "ready"}
            className="min-h-11 rounded-xl bg-[#30463c] px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
          >
            {connecting
              ? "Concluindo a conexão..."
              : sdkStatus === "loading"
                ? "Carregando a Meta..."
                : "Conectar WhatsApp oficial"}
          </button>
          <p className="mt-2 text-xs text-[#8a9891]">
            Você será levado ao fluxo oficial da Meta para autorizar e escolher o
            número. O token é enviado ao servidor e gravado cifrado — ele nunca
            aparece no navegador.
          </p>
          {sdkStatus === "error" && (
            <p role="alert" className="mt-1 text-xs text-red-700">
              Não foi possível carregar o SDK da Meta. Verifique a conexão e
              recarregue a página.
            </p>
          )}
        </div>
      )}

      {organization?.ready && !organization.connected && !signupEnabled && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">
            Conexão assistida indisponível no momento.
          </p>
          {missing.length > 0 ? (
            <>
              <p className="mt-1">
                Faltam variáveis no servidor (nomes, não segredos):
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {missing.map((key) => (
                  <li key={key}>
                    <code className="rounded bg-white/60 px-1">{key}</code>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1">
              O servidor não informou a configuração pública do Embedded Signup.
              Contate o responsável técnico.
            </p>
          )}
        </div>
      )}

      {organization?.connected && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            disabled={disconnecting}
            className="min-h-11 rounded-xl border border-[#e7c9c5] bg-[#fdf3f2] px-4 py-2 text-sm font-semibold text-[#8a3a30] transition disabled:opacity-50"
          >
            {disconnecting ? "Desconectando..." : "Desconectar número oficial"}
          </button>
          <p className="mt-2 text-xs text-[#8a9891]">
            Desconectar apaga a credencial guardada e interrompe o envio pela API
            oficial. Clientes, agendamentos e o histórico de mensagens não são
            apagados.
          </p>
        </div>
      )}
    </div>
  );
}

