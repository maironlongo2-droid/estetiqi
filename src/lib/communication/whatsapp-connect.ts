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
//   4. O servidor identifica a conta comercial (WABA) e o número autorizados e
//      confirma, com o PRÓPRIO token, que ambos são válidos antes de gravar.
//      Quando a Meta deixa mais de uma opção possível, o servidor NÃO escolhe:
//      devolve uma ambiguidade explícita para a profissional decidir.
//
// IMPORTANTE: a troca do `code` NÃO garante, por si só, um token permanente.
// Por isso a extensão é um passo SEPARADO e tratado como tal. Nenhuma função
// aqui registra o token ou o App Secret (não há `console`), e o resultado
// devolvido nunca inclui segredos em mensagens de erro.
//
// DIAGNÓSTICO: quando a Meta recusa, a falha carrega APENAS metadados técnicos
// (status HTTP, error.code, error.error_subcode, error.type, fbtrace_id). Quem
// transforma isso em log é o chamador — a URL da troca carrega `code` e
// `client_secret` na query string e NUNCA é registrada.

export const GRAPH_API_BASE = "https://graph.facebook.com";
export const DEFAULT_GRAPH_API_VERSION = "v21.0";

const REQUEST_TIMEOUT_MS = 10000;

// `fetch` compatível com a implementação global (injetável nos testes).
export type GraphFetch = typeof fetch;

// Corpo de erro da Graph API. `fbtrace_id` aparece dentro de `error` em parte
// das respostas e no nível raiz em outras — por isso os dois são lidos.
type MetaErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
  fbtrace_id?: string;
};

// Metadados de DIAGNÓSTICO da recusa da Meta. São apenas identificadores
// técnicos (números e ids opacos): nunca carregam o `code` de autorização, o
// token, o App Secret nem dados pessoais. Servem para CLASSIFICAR a falha no
// servidor (ex.: 190 = token inválido) e para o suporte da Meta rastrear o
// evento pelo `fbtrace_id`.
export type MetaErrorDiagnostics = {
  status: number | null;
  metaCode: number | null;
  metaSubcode: number | null;
  metaType: string | null;
  metaTraceId: string | null;
};

type JsonResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | ({ ok: false; message: string } & MetaErrorDiagnostics);

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
      const errorBody = body?.error;
      return {
        ok: false,
        status: response.status,
        metaCode: typeof errorBody?.code === "number" ? errorBody.code : null,
        metaSubcode:
          typeof errorBody?.error_subcode === "number"
            ? errorBody.error_subcode
            : null,
        metaType: typeof errorBody?.type === "string" ? errorBody.type : null,
        metaTraceId:
          typeof errorBody?.fbtrace_id === "string"
            ? errorBody.fbtrace_id
            : typeof body?.fbtrace_id === "string"
              ? body.fbtrace_id
              : null,
        message:
          errorBody?.message ??
          `A Meta recusou a requisição (HTTP ${response.status}).`,
      };
    }

    return { ok: true, status: response.status, data: data ?? {} };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "A requisição à Meta demorou demais e foi cancelada."
        : "Não foi possível contatar a API da Meta agora.";
    return {
      ok: false,
      status: null,
      metaCode: null,
      metaSubcode: null,
      metaType: null,
      metaTraceId: null,
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Projeta SOMENTE os metadados de diagnóstico, sem tocar em token ou segredo.
// Quando a resposta não trouxe erro (ex.: 200 sem `access_token`), os campos da
// Meta ficam nulos e o status HTTP real é preservado.
function diagnosticsOf(result: JsonResult): MetaErrorDiagnostics {
  if (result.ok) {
    return {
      status: result.status,
      metaCode: null,
      metaSubcode: null,
      metaType: null,
      metaTraceId: null,
    };
  }

  return {
    status: result.status,
    metaCode: result.metaCode,
    metaSubcode: result.metaSubcode,
    metaType: result.metaType,
    metaTraceId: result.metaTraceId,
  };
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

// A falha carrega os metadados de DIAGNÓSTICO da Meta (status HTTP, error.code,
// error_subcode, error.type, fbtrace_id) para que o chamador possa registrá-los
// sem nunca lidar com o `code`, com o token ou com o App Secret.
export type TokenExchangeFailure = {
  ok: false;
  code: "REQUEST_FAILED" | "META_REJECTED" | "NO_TOKEN";
  message: string;
} & MetaErrorDiagnostics;

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
    return {
      ok: false,
      code: "REQUEST_FAILED",
      message: result.message,
      ...diagnosticsOf(result),
    };
  }

  const accessToken = result.data.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return {
      ok: false,
      code: "NO_TOKEN",
      message: "A Meta não retornou um token de acesso válido.",
      ...diagnosticsOf(result),
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
    return {
      ok: false,
      code: "REQUEST_FAILED",
      message: result.message,
      ...diagnosticsOf(result),
    };
  }

  const accessToken = result.data.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return {
      ok: false,
      code: "NO_TOKEN",
      message: "A Meta não retornou um token de longa duração.",
      ...diagnosticsOf(result),
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

export type SinglePhoneNumberSelection =
  | { ok: true; phoneNumberId: string }
  | {
      ok: false;
      code: "WABA_PHONE_NOT_FOUND" | "WABA_PHONE_AMBIGUOUS";
      message: string;
    };

// Decide qual número usar quando a Meta NÃO informou o escolhido. Regra: só uma
// ÚNICA opção é aceita. Zero vira "não encontrado" e várias viram "ambíguo" —
// a escolha nunca é nossa: vincular a organização ao número errado é pior do
// que pedir para a profissional repetir o fluxo.
export function selectSinglePhoneNumber(
  numbers: WabaPhoneNumber[]
): SinglePhoneNumberSelection {
  if (numbers.length === 0) {
    return {
      ok: false,
      code: "WABA_PHONE_NOT_FOUND",
      message: "A conta comercial autorizada não possui número de telefone.",
    };
  }

  if (numbers.length > 1) {
    return {
      ok: false,
      code: "WABA_PHONE_AMBIGUOUS",
      message: "A conta comercial autorizada possui mais de um número.",
    };
  }

  return { ok: true, phoneNumberId: numbers[0].id };
}

// ---------------------------------------------------------------------------
// Identificação INEQUÍVOCA da conta comercial (WABA) e do número autorizados
// ---------------------------------------------------------------------------

// Escopos que provam que a autorização cobre uma conta comercial (WABA), na
// ordem de prioridade de leitura. A doc do Embedded Signup manda usar o
// `whatsapp_business_management`; o de mensagens é apenas um segundo caminho
// documentado, caso a Meta conceda só ele.
const WABA_SCOPES = [
  "whatsapp_business_management",
  "whatsapp_business_messaging",
] as const;

// Mensagens fixas: nenhuma delas carrega token, código de autorização, segredo
// ou URL com credenciais.
const TOKEN_INVALID_MESSAGE =
  "A autorização devolvida pela Meta não é mais válida (o código expira em 30 segundos). Repita o fluxo de conexão.";
const UNEXPECTED_RESPONSE_MESSAGE =
  "A Meta respondeu em um formato inesperado ao identificar a conta comercial autorizada.";

export type AuthorizedBusinessAccount = {
  id: string;
  // Escopo da Meta que provou a autorização desta conta.
  scope: string;
};

export type AuthorizedAccountsResult =
  | {
      ok: true;
      accounts: AuthorizedBusinessAccount[];
      // Escopos EFETIVAMENTE devolvidos pela Meta na inspeção do token.
      scopes: string[];
    }
  | {
      ok: false;
      code: "WABA_TOKEN_INVALID" | "WABA_RESOLUTION_FAILED";
      message: string;
    };

// Inspeciona o token recém-autorizado e devolve TODAS as contas comerciais
// (WABA) que ele cobre — nunca apenas a primeira. Com mais de uma conta
// autorizada a decisão é da profissional: o servidor não adivinha qual conta
// pertence à organização.
//
// Por que existe: o Embedded Signup pode concluir devolvendo apenas o `code` —
// sem `phone_number_id` e, às vezes, sem `waba_id` no postMessage (na versão
// atual da Meta o canal oficial de conclusão é o webhook `account_update`).
// Sem isto, uma autorização VÁLIDA seria recusada só porque o navegador não
// recebeu os identificadores.
//
// Como (documentação oficial):
//   GET /{version}/debug_token?input_token=<TOKEN_RETURNED_FROM_SIGNUP_FLOW>
//   Authorization: Bearer <token de app>   →  app_id|app_secret
// A doc do endpoint (Debug Token) exige um token de app (ou de desenvolvedor do
// app) referente ao token inspecionado; a doc do Embedded Signup o envia em
// cabeçalho `Authorization: Bearer`. A resposta traz `granular_scopes` no
// formato `{ scope, target_ids }` (a doc tipa `target_ids` como `?int[]`: pode
// ser numérico e pode vir ausente), associando cada escopo concedido às contas
// autorizadas.
//
// SEGURANÇA: o token inspecionado viaja na query (contrato da Meta), então este
// módulo nunca registra a URL e nenhuma mensagem de erro carrega URL, token ou
// segredo. Não presuma nada: cada campo é validado antes de virar decisão.
export async function fetchAuthorizedBusinessAccounts(
  input: {
    accessToken: string;
    appId: string;
    appSecret: string;
    graphVersion?: string;
  },
  fetchImpl: GraphFetch = fetch
): Promise<AuthorizedAccountsResult> {
  const version = input.graphVersion ?? DEFAULT_GRAPH_API_VERSION;
  const url = buildGraphUrl(version, "debug_token", {
    input_token: input.accessToken,
  });

  const result = await requestJson(url, fetchImpl, {
    headers: {
      Authorization: `Bearer ${input.appId}|${input.appSecret}`,
    },
  });

  if (!result.ok) {
    // 190 = token de acesso inválido/expirado. Um token recusado NÃO é falha
    // transitória de consulta: a profissional precisa repetir o fluxo.
    if (result.metaCode === 190 || result.status === 401) {
      return {
        ok: false,
        code: "WABA_TOKEN_INVALID",
        message: TOKEN_INVALID_MESSAGE,
      };
    }
    return {
      ok: false,
      code: "WABA_RESOLUTION_FAILED",
      message: result.message,
    };
  }

  const data = result.data.data;
  if (!data || typeof data !== "object") {
    return {
      ok: false,
      code: "WABA_RESOLUTION_FAILED",
      message: UNEXPECTED_RESPONSE_MESSAGE,
    };
  }

  const record = data as Record<string, unknown>;
  if (record.is_valid === false) {
    return {
      ok: false,
      code: "WABA_TOKEN_INVALID",
      message: TOKEN_INVALID_MESSAGE,
    };
  }

  const scopes = Array.isArray(record.scopes)
    ? record.scopes.filter(
        (scope): scope is string => typeof scope === "string"
      )
    : [];

  const granularScopes = Array.isArray(record.granular_scopes)
    ? record.granular_scopes
    : [];

  const accounts: AuthorizedBusinessAccount[] = [];
  const seen = new Set<string>();

  // Percorremos os escopos na ordem de prioridade (gestão antes de mensagens) e
  // mantemos TODOS os alvos válidos, sem repetir.
  for (const candidateScope of WABA_SCOPES) {
    for (const entry of granularScopes) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      if (row.scope !== candidateScope) continue;
      if (!Array.isArray(row.target_ids)) continue;

      for (const raw of row.target_ids) {
        // A doc tipa os IDs como inteiros; só aceitamos inteiro (string de
        // dígitos ou número) para nunca tratar lixo como ID de conta comercial.
        const id =
          typeof raw === "number" && Number.isInteger(raw)
            ? String(raw)
            : typeof raw === "string"
              ? raw.trim()
              : "";
        if (!/^\d+$/.test(id) || seen.has(id)) continue;
        seen.add(id);
        accounts.push({ id, scope: candidateScope });
      }
    }
  }

  return { ok: true, accounts, scopes };
}

export type ConnectionCandidateAccount = {
  businessAccountId: string;
  // Números conhecidos da conta; null quando a Meta não os devolveu.
  numbers: WabaPhoneNumber[] | null;
};

// Códigos de falha do alvo. Viram a resposta HTTP do endpoint (nunca 500 por
// erro previsível) e alimentam o texto mostrado à profissional na tela.
export type ConnectionTargetFailureCode =
  | "PHONE_NOT_AUTHORIZED"
  | "PHONE_NOT_IN_WABA"
  | "WABA_NOT_RESOLVED"
  | "WABA_SCOPES_MISSING"
  | "WABA_PHONE_NOT_FOUND"
  | "WABA_TOKEN_INVALID"
  | "WABA_RESOLUTION_FAILED"
  | "WABA_LOOKUP_FAILED"
  | "PLATFORM_NOT_CONFIGURED";

// Resultado da identificação do alvo da conexão:
//   ok        → existe UMA conta e UM número, já validados com o token;
//   ambiguous → há mais de uma possibilidade; NADA pode ser gravado ainda;
//   failed    → não há dados suficientes/validáveis; erro explícito e seguro.
export type ConnectionTargetResolution =
  | {
      ok: true;
      phoneNumberId: string;
      businessAccountId: string | null;
      displayPhoneNumber: string | null;
      verifiedName: string | null;
    }
  | {
      ok: false;
      outcome: "ambiguous";
      code: "WABA_SELECTION_REQUIRED" | "PHONE_SELECTION_REQUIRED";
      message: string;
      // Opções conhecidas para a seleção EXPLÍCITA da profissional.
      accounts: ConnectionCandidateAccount[];
    }
  | {
      ok: false;
      outcome: "failed";
      code: ConnectionTargetFailureCode;
      message: string;
    };

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function hasAnyWabaScope(scopes: string[]): boolean {
  return WABA_SCOPES.some((scope) => scopes.includes(scope));
}

type DiscoveryResult =
  | AuthorizedAccountsResult
  | { ok: false; code: "PLATFORM_NOT_CONFIGURED"; message: string };

// Inspeção do token para descobrir as contas comerciais autorizadas. Sem App
// ID/App Secret não há como inspecionar o token: é falta de configuração do
// SERVIDOR, e a resposta precisa dizer isso (não culpar a profissional).
async function discoverAuthorizedAccounts(
  input: {
    accessToken: string;
    appId: string | null;
    appSecret: string | null;
  },
  fetchImpl: GraphFetch,
  graphVersion: string
): Promise<DiscoveryResult> {
  const appId = normalizeId(input.appId);
  const appSecret = normalizeId(input.appSecret);
  if (!appId || !appSecret) {
    return {
      ok: false,
      code: "PLATFORM_NOT_CONFIGURED",
      message:
        "A integração oficial da Meta (App ID/App Secret) não está configurada no servidor.",
    };
  }

  return fetchAuthorizedBusinessAccounts(
    { accessToken: input.accessToken, appId, appSecret, graphVersion },
    fetchImpl
  );
}

// Confirma, com o PRÓPRIO token da organização, que o `phone_number_id` é
// legível (validação obrigatória antes de gravar) e devolve os dados públicos
// usados na tela da Central de Comunicação.
async function confirmPhoneNumber(
  input: {
    phoneNumberId: string;
    businessAccountId: string | null;
    accessToken: string;
    graphVersion: string;
  },
  fetchImpl: GraphFetch
): Promise<ConnectionTargetResolution> {
  const phone = await fetchAuthorizedPhoneNumber(
    {
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      graphVersion: input.graphVersion,
    },
    fetchImpl
  );
  if (!phone.ok) {
    return {
      ok: false,
      outcome: "failed",
      code: "PHONE_NOT_AUTHORIZED",
      message: `Não foi possível confirmar o número na Meta: ${phone.message}`,
    };
  }

  return {
    ok: true,
    phoneNumberId: input.phoneNumberId,
    businessAccountId: input.businessAccountId,
    displayPhoneNumber: phone.phone.displayPhoneNumber,
    verifiedName: phone.phone.verifiedName,
  };
}

function ambiguousTarget(
  code: "WABA_SELECTION_REQUIRED" | "PHONE_SELECTION_REQUIRED",
  message: string,
  accounts: ConnectionCandidateAccount[]
): ConnectionTargetResolution {
  return { ok: false, outcome: "ambiguous", code, message, accounts };
}

// Números conhecidos de cada conta autorizada (best effort). Uma conta cujo
// número não pôde ser lido continua na lista com `numbers: null`: mostramos a
// opção e o servidor não inventa nada.
async function describeCandidateAccounts(
  accounts: AuthorizedBusinessAccount[],
  accessToken: string,
  graphVersion: string,
  fetchImpl: GraphFetch
): Promise<ConnectionCandidateAccount[]> {
  const candidates: ConnectionCandidateAccount[] = [];
  for (const account of accounts) {
    const listed = await fetchWabaPhoneNumbers(
      { wabaId: account.id, accessToken, graphVersion },
      fetchImpl
    );
    candidates.push({
      businessAccountId: account.id,
      numbers: listed.ok ? listed.numbers : null,
    });
  }
  return candidates;
}

// Decide QUAL conta comercial (WABA) e QUAL número serão gravados.
//
// Regra central: só existe conclusão automática quando a associação é
// INEQUÍVOCA. Com mais de uma conta autorizada, ou mais de um número possível,
// devolvemos um estado de ambiguidade SEM gravar nada, para que a seleção seja
// explícita.
//
// Todo identificador vindo do cliente é tratado como DICA a verificar: nada é
// aceito sem que o token da organização consiga ler o número na Meta.
export async function resolveConnectionTarget(
  input: {
    accessToken: string;
    graphVersion?: string;
    providedPhoneNumberId: string | null;
    providedBusinessAccountId: string | null;
    appId: string | null;
    appSecret: string | null;
  },
  fetchImpl: GraphFetch = fetch
): Promise<ConnectionTargetResolution> {
  const graphVersion = input.graphVersion ?? DEFAULT_GRAPH_API_VERSION;
  const providedPhoneNumberId = normalizeId(input.providedPhoneNumberId);
  const providedBusinessAccountId = normalizeId(input.providedBusinessAccountId);

  // (A) A Meta informou a conta comercial: ela é validada listando os seus
  // números COM O TOKEN e o número escolhido precisa pertencer a ela.
  if (providedBusinessAccountId) {
    const listed = await fetchWabaPhoneNumbers(
      {
        wabaId: providedBusinessAccountId,
        accessToken: input.accessToken,
        graphVersion,
      },
      fetchImpl
    );
    if (!listed.ok) {
      return {
        ok: false,
        outcome: "failed",
        code: "WABA_LOOKUP_FAILED",
        message: `Não foi possível validar a conta comercial informada pela Meta: ${listed.message}`,
      };
    }

    if (providedPhoneNumberId) {
      const belongs = listed.numbers.some(
        (number) => number.id === providedPhoneNumberId
      );
      if (!belongs) {
        return {
          ok: false,
          outcome: "failed",
          code: "PHONE_NOT_IN_WABA",
          message:
            "O número informado não pertence à conta comercial autorizada. Repita o fluxo e selecione o número desejado.",
        };
      }

      return confirmPhoneNumber(
        {
          phoneNumberId: providedPhoneNumberId,
          businessAccountId: providedBusinessAccountId,
          accessToken: input.accessToken,
          graphVersion,
        },
        fetchImpl
      );
    }

    const selected = selectSinglePhoneNumber(listed.numbers);
    if (!selected.ok) {
      if (selected.code === "WABA_PHONE_AMBIGUOUS") {
        return ambiguousTarget(
          "PHONE_SELECTION_REQUIRED",
          "A conta comercial autorizada tem mais de um número. Repita o fluxo e escolha o número desejado. Nada foi gravado.",
          [
            {
              businessAccountId: providedBusinessAccountId,
              numbers: listed.numbers,
            },
          ]
        );
      }

      return {
        ok: false,
        outcome: "failed",
        code: "WABA_PHONE_NOT_FOUND",
        message: selected.message,
      };
    }

    return confirmPhoneNumber(
      {
        phoneNumberId: selected.phoneNumberId,
        businessAccountId: providedBusinessAccountId,
        accessToken: input.accessToken,
        graphVersion,
      },
      fetchImpl
    );
  }

  // (B) A Meta informou apenas o número: ele é validado com o token e a conta
  // comercial é DESCOBERTA (nunca adivinhada) apenas para ser gravada junto.
  if (providedPhoneNumberId) {
    const phone = await fetchAuthorizedPhoneNumber(
      {
        phoneNumberId: providedPhoneNumberId,
        accessToken: input.accessToken,
        graphVersion,
      },
      fetchImpl
    );
    if (!phone.ok) {
      return {
        ok: false,
        outcome: "failed",
        code: "PHONE_NOT_AUTHORIZED",
        message: `Não foi possível confirmar o número informado pela Meta: ${phone.message}`,
      };
    }

    // A descoberta serve apenas para GRAVAR a conta comercial. Quando ela não é
    // possível (sem escopos, sem credenciais do app ou falha transitória) a
    // conexão segue com `businessAccountId` nulo: o número escolhido pela
    // profissional dentro do fluxo da Meta já foi validado acima. Nunca
    // inventamos um vínculo.
    const discovery = await discoverAuthorizedAccounts(
      input,
      fetchImpl,
      graphVersion
    );

    let owner: string | null = null;
    if (discovery.ok) {
      const owners: string[] = [];
      for (const account of discovery.accounts) {
        const listed = await fetchWabaPhoneNumbers(
          { wabaId: account.id, accessToken: input.accessToken, graphVersion },
          fetchImpl
        );
        if (
          listed.ok &&
          listed.numbers.some((number) => number.id === providedPhoneNumberId)
        ) {
          owners.push(account.id);
        }
      }

      if (owners.length > 1) {
        // Defensivo: a Meta não deveria associar o mesmo número a duas contas.
        return ambiguousTarget(
          "WABA_SELECTION_REQUIRED",
          "A Meta associou o número informado a mais de uma conta comercial. Repita o fluxo escolhendo a conta e o número desejados. Nada foi gravado.",
          owners.map((businessAccountId) => ({
            businessAccountId,
            numbers: null,
          }))
        );
      }

      owner = owners[0] ?? null;
    }

    return {
      ok: true,
      phoneNumberId: providedPhoneNumberId,
      businessAccountId: owner,
      displayPhoneNumber: phone.phone.displayPhoneNumber,
      verifiedName: phone.phone.verifiedName,
    };
  }

  // (C) A Meta não informou nada: descobrimos as contas autorizadas a partir do
  // token e só concluímos quando existe UMA conta com UM número.
  const discovery = await discoverAuthorizedAccounts(
    input,
    fetchImpl,
    graphVersion
  );
  if (!discovery.ok) {
    return {
      ok: false,
      outcome: "failed",
      code: discovery.code,
      message: discovery.message,
    };
  }

  if (discovery.accounts.length === 0) {
    if (!hasAnyWabaScope(discovery.scopes)) {
      return {
        ok: false,
        outcome: "failed",
        code: "WABA_SCOPES_MISSING",
        message:
          "A autorização concedida não inclui os escopos de gestão do WhatsApp Business, então não é possível identificar a conta comercial. Repita o fluxo aceitando as permissões solicitadas.",
      };
    }

    return {
      ok: false,
      outcome: "failed",
      code: "WABA_NOT_RESOLVED",
      message:
        "A Meta não informou qual conta comercial (WhatsApp Business Account) foi autorizada. Repita o fluxo e selecione o número desejado.",
    };
  }

  if (discovery.accounts.length > 1) {
    const candidates = await describeCandidateAccounts(
      discovery.accounts,
      input.accessToken,
      graphVersion,
      fetchImpl
    );

    return ambiguousTarget(
      "WABA_SELECTION_REQUIRED",
      "A autorização cobre mais de uma conta comercial. Repita o fluxo escolhendo a conta e o número desejados. Nada foi gravado.",
      candidates
    );
  }

  const only = discovery.accounts[0];
  const listed = await fetchWabaPhoneNumbers(
    { wabaId: only.id, accessToken: input.accessToken, graphVersion },
    fetchImpl
  );
  if (!listed.ok) {
    return {
      ok: false,
      outcome: "failed",
      code: "WABA_LOOKUP_FAILED",
      message: `Não foi possível consultar os números da conta comercial autorizada na Meta: ${listed.message}`,
    };
  }

  const selected = selectSinglePhoneNumber(listed.numbers);
  if (!selected.ok) {
    if (selected.code === "WABA_PHONE_AMBIGUOUS") {
      return ambiguousTarget(
        "PHONE_SELECTION_REQUIRED",
        "A conta comercial autorizada tem mais de um número. Repita o fluxo e escolha o número desejado. Nada foi gravado.",
        [{ businessAccountId: only.id, numbers: listed.numbers }]
      );
    }

    return {
      ok: false,
      outcome: "failed",
      code: "WABA_PHONE_NOT_FOUND",
      message: selected.message,
    };
  }

  return confirmPhoneNumber(
    {
      phoneNumberId: selected.phoneNumberId,
      businessAccountId: only.id,
      accessToken: input.accessToken,
      graphVersion,
    },
    fetchImpl
  );
}
