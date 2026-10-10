// Conexão oficial com a WhatsApp Business Platform (Meta) para MÚLTIPLAS
// organizações — troca do código de autorização do Embedded Signup.
//
// MÓDULO EXCLUSIVO DO SERVIDOR e SEM IMPORTAÇÕES DE PROJETO: usa apenas `fetch`
// (injetável). Isso permite verificar o fluxo sem rede e sem banco, e garante que
// este módulo nunca traga segredos do cliente para o servidor por engano.
//
// Fluxo oficial (Embedded Signup / Facebook Login for Business):
//   1. O navegador conclui o Embedded Signup e recebe um `code`.
//   2. O servidor troca o `code` por um token de acesso (GET /oauth/access_token).
//   3. O servidor ESTENDE esse token para longa duração (grant_type=fb_exchange_token).
//   4. O servidor confirma que o token lê o `phone_number_id` autorizado.
//
// IMPORTANTE: a troca do `code` NÃO garante, por si só, um token permanente.
// Por isso a extensão é um passo SEPARADO e tratado como tal. Nenhuma função
// aqui registra o token ou o App Secret (não há `console`), e o resultado
// devolvido nunca inclui segredos em mensagens de erro.

export const GRAPH_API_BASE = "https://graph.facebook.com";
export const DEFAULT_GRAPH_API_VERSION = "v21.0";

const REQUEST_TIMEOUT_MS = 10000;

// `fetch` compatível com a implementação global (injetável nos testes).
export type GraphFetch = typeof fetch;

type MetaErrorBody = { error?: { message?: string; type?: string; code?: number } };

type JsonResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | { ok: false; status: number | null; message: string };

async function requestJson(
  url: string,
  fetchImpl: GraphFetch,
  init?: RequestInit
): Promise<JsonResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!response.ok) {
      const body = data as MetaErrorBody | null;
      return {
        ok: false,
        status: response.status,
        message:
          body?.error?.message ??
          `A Meta recusou a requisição (HTTP ${response.status}).`,
      };
    }

    return { ok: true, status: response.status, data: data ?? {} };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "A requisição à Meta demorou demais e foi cancelada."
        : "Não foi possível contatar a API da Meta agora.";
    return { ok: false, status: null, message };
  } finally {
    clearTimeout(timeout);
  }
}

function buildGraphUrl(
  version: string,
  path: string,
  query: Record<string, string>
) {
  const url = new URL(`${GRAPH_API_BASE}/${version}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export type TokenExchangeSuccess = {
  ok: true;
  accessToken: string;
  // Segundos até expirar, quando a Meta informa. null = sem informação.
  expiresInSeconds: number | null;
};

export type TokenExchangeFailure = {
  ok: false;
  code: "REQUEST_FAILED" | "META_REJECTED" | "NO_TOKEN";
  message: string;
};

// Troca o `code` do Embedded Signup por um token de acesso. Segue estritamente
// o endpoint oficial de OAuth e valida a resposta antes de devolver o token.
export async function exchangeAuthorizationCode(
  input: {
    code: string;
    appId: string;
    appSecret: string;
    graphVersion?: string;
  },
  fetchImpl: GraphFetch = fetch
): Promise<TokenExchangeSuccess | TokenExchangeFailure> {
  const version = input.graphVersion ?? DEFAULT_GRAPH_API_VERSION;
  const url = buildGraphUrl(version, "oauth/access_token", {
    client_id: input.appId,
    client_secret: input.appSecret,
    code: input.code,
  });

  const result = await requestJson(url, fetchImpl);
  if (!result.ok) {
    return { ok: false, code: "REQUEST_FAILED", message: result.message };
  }

  const accessToken = result.data.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return {
      ok: false,
      code: "NO_TOKEN",
      message: "A Meta não retornou um token de acesso válido.",
    };
  }

  const expiresIn = result.data.expires_in;
  return {
    ok: true,
    accessToken: accessToken.trim(),
    expiresInSeconds:
      typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? expiresIn
        : null,
  };
}

// Estende um token de curta duração para longa duração (fb_exchange_token).
// Não é chamado às cegas: em caso de recusa, devolvemos falha e o chamador
// decide se o token curto ainda serve.
export async function extendToLongLivedToken(
  input: {
    accessToken: string;
    appId: string;
    appSecret: string;
    graphVersion?: string;
  },
  fetchImpl: GraphFetch = fetch
): Promise<TokenExchangeSuccess | TokenExchangeFailure> {
  const version = input.graphVersion ?? DEFAULT_GRAPH_API_VERSION;
  const url = buildGraphUrl(version, "oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: input.appId,
    client_secret: input.appSecret,
    fb_exchange_token: input.accessToken,
  });

  const result = await requestJson(url, fetchImpl);
  if (!result.ok) {
    return { ok: false, code: "REQUEST_FAILED", message: result.message };
  }

  const accessToken = result.data.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return {
      ok: false,
      code: "NO_TOKEN",
      message: "A Meta não retornou um token de longa duração.",
    };
  }

  const expiresIn = result.data.expires_in;
  return {
    ok: true,
    accessToken: accessToken.trim(),
    expiresInSeconds:
      typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? expiresIn
        : null,
  };
}

export type AuthorizedPhoneNumber = {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
};

// Confirma que o token realmente lê o `phone_number_id` autorizado e captura os
// dados exibíveis. Serve de validação: não vinculamos um número que a credencial
// não consegue acessar.
export async function fetchAuthorizedPhoneNumber(
  input: {
    phoneNumberId: string;
    accessToken: string;
    graphVersion?: string;
  },
  fetchImpl: GraphFetch = fetch
): Promise<
  { ok: true; phone: AuthorizedPhoneNumber } | { ok: false; message: string }
> {
  const version = input.graphVersion ?? DEFAULT_GRAPH_API_VERSION;
  const url = buildGraphUrl(version, encodeURIComponent(input.phoneNumberId), {
    fields: "display_phone_number,verified_name",
  });

  const result = await requestJson(url, fetchImpl, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const displayPhoneNumber = result.data.display_phone_number;
  const verifiedName = result.data.verified_name;

  return {
    ok: true,
    phone: {
      displayPhoneNumber:
        typeof displayPhoneNumber === "string" ? displayPhoneNumber : null,
      verifiedName: typeof verifiedName === "string" ? verifiedName : null,
    },
  };
}

export type WabaPhoneNumber = {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
};

// Lista os números de telefone da conta comercial (WABA) que o token autorizado
// consegue ler. Existe porque as versões atuais do Embedded Signup permitem
// concluir o fluxo SEM que a Meta informe qual número foi escolhido (inclusive
// sem número algum). NUNCA escolhemos por conta própria: quem chama decide o que
// fazer com zero ou com várias opções.
export async function fetchWabaPhoneNumbers(
  input: {
    wabaId: string;
    accessToken: string;
    graphVersion?: string;
  },
  fetchImpl: GraphFetch = fetch
): Promise<
  { ok: true; numbers: WabaPhoneNumber[] } | { ok: false; message: string }
> {
  const version = input.graphVersion ?? DEFAULT_GRAPH_API_VERSION;
  const url = buildGraphUrl(
    version,
    `${encodeURIComponent(input.wabaId)}/phone_numbers`,
    { fields: "id,display_phone_number,verified_name" }
  );

  const result = await requestJson(url, fetchImpl, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const rows = Array.isArray(result.data.data) ? result.data.data : [];
  const numbers: WabaPhoneNumber[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) continue;
    numbers.push({
      id,
      displayPhoneNumber:
        typeof record.display_phone_number === "string"
          ? record.display_phone_number
          : null,
      verifiedName:
        typeof record.verified_name === "string" ? record.verified_name : null,
    });
  }

  return { ok: true, numbers };
}

