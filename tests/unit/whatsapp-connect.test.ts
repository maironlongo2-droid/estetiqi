// Testes do módulo de conexão oficial do WhatsApp (Meta).
//
// Sem rede e sem banco: o `fetch` é injetado, então cada resposta da Graph API é
// simulada e o comportamento REAL do módulo é verificado.
//
// FOCO (a mesma regra do produto):
//   1. a identificação da conta comercial (WABA) e do número só conclui quando é
//      INEQUÍVOCA;
//   2. com várias contas/números autorizados nada é escolhido: o resultado é um
//      estado de ambiguidade e não existe alvo pronto para ser gravado;
//   3. todo identificador (do cliente ou da Meta) é VALIDADO com o token antes
//      de virar decisão;
//   4. nenhuma mensagem de erro carrega token, código de autorização ou segredo.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchAuthorizedBusinessAccounts,
  fetchWabaPhoneNumbers,
  resolveConnectionTarget,
  selectSinglePhoneNumber,
} from "../../src/lib/communication/whatsapp-connect.ts";

const WABA_A = "102289599326934";
const WABA_B = "101569239400667";
const PHONE_ID = "1099887766";

const WABA_ID = "1099887766554433";
const ACCESS_TOKEN = "token-secreto-da-organizacao";
const APP_ID = "2105751366998902";
const APP_SECRET = "segredo-do-app-da-estetiqi";

type RecordedCall = {
  url: string;
  method: string;
  authorization: string | null;
};

function stubFetch(responses: Response[]): {
  calls: RecordedCall[];
  fetchImpl: typeof fetch;
} {
  const calls: RecordedCall[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url:
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      method: init?.method ?? "GET",
      authorization: headers.get("authorization"),
    });

    const response = responses.shift();
    if (!response) {
      throw new Error("o teste chamou a API mais vezes do que o esperado");
    }
    return response;
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchWabaPhoneNumbers", () => {
  it("lê os números da conta comercial com o token, sem expô-lo na URL", async () => {
    const { calls, fetchImpl } = stubFetch([
      jsonResponse(200, {
        data: [
          {
            id: "1099887766",
            display_phone_number: "+55 11 98888-7777",
            verified_name: "Estética da Ana",
          },
        ],
      }),
    ]);

    const result = await fetchWabaPhoneNumbers(
      { wabaId: WABA_ID, accessToken: ACCESS_TOKEN },
      fetchImpl
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.ok === true && result.numbers, [
      {
        id: "1099887766",
        displayPhoneNumber: "+55 11 98888-7777",
        verifiedName: "Estética da Ana",
      },
    ]);

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      `https://graph.facebook.com/v21.0/${WABA_ID}/phone_numbers?fields=id%2Cdisplay_phone_number%2Cverified_name`
    );
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].authorization, `Bearer ${ACCESS_TOKEN}`);
    assert.equal(
      calls[0].url.includes(ACCESS_TOKEN),
      false,
      "o token nunca pode viajar na URL"
    );
  });

  it("devolve lista vazia quando a conta comercial não tem número", async () => {
    const { fetchImpl } = stubFetch([jsonResponse(200, { data: [] })]);

    const result = await fetchWabaPhoneNumbers(
      { wabaId: WABA_ID, accessToken: ACCESS_TOKEN },
      fetchImpl
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.ok === true && result.numbers, []);
  });

  it("mantém TODOS os números: quem decide é quem chama, nunca o palpite", async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(200, {
        data: [
          { id: "111", display_phone_number: "+55 11 90000-0001" },
          { id: "222", verified_name: "Filial" },
          { id: "", display_phone_number: "+55 11 90000-0003" },
          "lixo",
        ],
      }),
    ]);

    const result = await fetchWabaPhoneNumbers(
      { wabaId: WABA_ID, accessToken: ACCESS_TOKEN },
      fetchImpl
    );

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.ok === true && result.numbers.map((number) => number.id),
      ["111", "222"]
    );
    assert.equal(result.ok === true && result.numbers[0].verifiedName, null);
    assert.equal(result.ok === true && result.numbers[1].displayPhoneNumber, null);
  });

  it("trata resposta sem `data` (formato inesperado) como lista vazia", async () => {
    const { fetchImpl } = stubFetch([jsonResponse(200, { foo: "bar" })]);

    const result = await fetchWabaPhoneNumbers(
      { wabaId: WABA_ID, accessToken: ACCESS_TOKEN },
      fetchImpl
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.ok === true && result.numbers, []);
  });

  it("usa a mensagem da Meta quando a requisição é recusada", async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(400, {
        error: { message: "Unsupported get request.", code: 100 },
      }),
    ]);

    const result = await fetchWabaPhoneNumbers(
      { wabaId: WABA_ID, accessToken: ACCESS_TOKEN },
      fetchImpl
    );

    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false && result.message,
      "Unsupported get request."
    );
  });

  it("não vaza o token quando a rede falha", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const result = await fetchWabaPhoneNumbers(
      { wabaId: WABA_ID, accessToken: ACCESS_TOKEN },
      fetchImpl
    );

    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false && result.message,
      "Não foi possível contatar a API da Meta agora."
    );
    assert.equal(
      (result.ok === false && result.message.includes(ACCESS_TOKEN)) || false,
      false
    );
  });
});

describe("fetchAuthorizedBusinessAccounts", () => {
  const inspectInput = {
    accessToken: ACCESS_TOKEN,
    appId: APP_ID,
    appSecret: APP_SECRET,
  };

  it("devolve TODAS as contas autorizadas e nunca escolhe a primeira", async () => {
    const { calls, fetchImpl } = stubFetch([
      jsonResponse(200, {
        data: {
          app_id: APP_ID,
          application: "EstetiQI",
          is_valid: true,
          granular_scopes: [
            { scope: "public_profile" },
            {
              scope: "whatsapp_business_management",
              target_ids: ["102289599326934", "101569239400667"],
            },
            {
              scope: "whatsapp_business_messaging",
              target_ids: ["101569239400667", "555"],
            },
          ],
          scopes: [
            "whatsapp_business_management",
            "whatsapp_business_messaging",
          ],
          type: "USER",
        },
      }),
    ]);

    const result = await fetchAuthorizedBusinessAccounts(
      inspectInput,
      fetchImpl
    );

    assert.equal(result.ok, true);
    // Sem repetição e na ordem dos escopos (gestão antes de mensagens).
    assert.deepEqual(result.ok === true && result.accounts, [
      { id: "102289599326934", scope: "whatsapp_business_management" },
      { id: "101569239400667", scope: "whatsapp_business_management" },
      { id: "555", scope: "whatsapp_business_messaging" },
    ]);
    assert.deepEqual(result.ok === true && result.scopes, [
      "whatsapp_business_management",
      "whatsapp_business_messaging",
    ]);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.equal(
      calls[0].url,
      `https://graph.facebook.com/v21.0/debug_token?input_token=${ACCESS_TOKEN}`
    );
    // O token do APP (app_id|app_secret) vai no cabeçalho, como na documentação
    // do Embedded Signup — e NUNCA na URL.
    assert.equal(calls[0].authorization, `Bearer ${APP_ID}|${APP_SECRET}`);
    assert.equal(calls[0].url.includes(APP_SECRET), false);
    assert.equal(calls[0].url.includes(`${APP_ID}|${APP_SECRET}`), false);
  });

  it("aceita target_ids numérico e ignora valores inválidos sem descartar os válidos", async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(200, {
        data: {
          is_valid: true,
          granular_scopes: [
            {
              scope: "whatsapp_business_management",
              target_ids: [
                "",
                "  ",
                "lixo",
                null,
                101569239400667,
                "102289599326934",
              ],
            },
          ],
        },
      }),
    ]);

    const result = await fetchAuthorizedBusinessAccounts(
      inspectInput,
      fetchImpl
    );

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.ok === true && result.accounts.map((account) => account.id),
      ["101569239400667", "102289599326934"]
    );
  });

  it("sem granular_scopes devolve lista vazia com os escopos que a Meta informou", async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(200, {
        data: { is_valid: true, scopes: ["public_profile"] },
      }),
    ]);

    const result = await fetchAuthorizedBusinessAccounts(
      inspectInput,
      fetchImpl
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.ok === true && result.accounts, []);
    assert.deepEqual(result.ok === true && result.scopes, ["public_profile"]);
  });

  it("resposta sem `data` (formato inesperado) vira WABA_RESOLUTION_FAILED", async () => {
    const { fetchImpl } = stubFetch([jsonResponse(200, { foo: "bar" })]);

    const result = await fetchAuthorizedBusinessAccounts(
      inspectInput,
      fetchImpl
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, "WABA_RESOLUTION_FAILED");
  });

  it("token inválido (is_valid false) vira WABA_TOKEN_INVALID, sem segredo", async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(200, { data: { is_valid: false } }),
    ]);

    const result = await fetchAuthorizedBusinessAccounts(
      inspectInput,
      fetchImpl
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, "WABA_TOKEN_INVALID");
    assert.equal(
      (result.ok === false && result.message.includes(ACCESS_TOKEN)) || false,
      false
    );
    assert.equal(
      (result.ok === false && result.message.includes(APP_SECRET)) || false,
      false
    );
  });

  it("token recusado pela Meta (erro 190) vira WABA_TOKEN_INVALID sem repassar o texto cru", async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(400, {
        error: { message: "Invalid OAuth access token.", code: 190 },
      }),
    ]);

    const result = await fetchAuthorizedBusinessAccounts(
      inspectInput,
      fetchImpl
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, "WABA_TOKEN_INVALID");
    assert.equal(
      (result.ok === false && result.message.includes("Invalid OAuth")) ||
        false,
      false
    );
  });

  it("falha de rede vira WABA_RESOLUTION_FAILED, sem vazar token ou segredo", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const result = await fetchAuthorizedBusinessAccounts(
      inspectInput,
      fetchImpl
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, "WABA_RESOLUTION_FAILED");
    assert.equal(
      (result.ok === false && result.message.includes(ACCESS_TOKEN)) || false,
      false
    );
    assert.equal(
      (result.ok === false && result.message.includes(APP_SECRET)) || false,
      false
    );
  });
});

// ---------------------------------------------------------------------------
// resolveConnectionTarget — decide QUAL conta/número pode ser GRAVADO.
//
// A regra testada é a do produto: identificador informado pela Meta é uma DICA
// que precisa ser validada com o token; quando não há dica, só conclui se a
// associação for inequívoca; qualquer ambiguidade volta SEM alvo persistível.
// ---------------------------------------------------------------------------

type Resolution = Awaited<ReturnType<typeof resolveConnectionTarget>>;

function expectSuccess(result: Resolution) {
  if (!result.ok) {
    assert.fail(`esperava sucesso, recebi ${JSON.stringify(result)}`);
  }
  return result;
}

function expectFailure(result: Resolution) {
  if (result.ok || result.outcome !== "failed") {
    assert.fail(`esperava falha, recebi ${JSON.stringify(result)}`);
  }
  return result;
}

function expectAmbiguity(result: Resolution) {
  if (result.ok || result.outcome !== "ambiguous") {
    assert.fail(`esperava ambiguidade, recebi ${JSON.stringify(result)}`);
  }
  return result;
}

describe("resolveConnectionTarget", () => {
  const baseInput = {
    accessToken: ACCESS_TOKEN,
    providedPhoneNumberId: PHONE_ID,
    providedBusinessAccountId: WABA_A,
    appId: APP_ID,
    appSecret: APP_SECRET,
  };

  const noIds = {
    ...baseInput,
    providedPhoneNumberId: null,
    providedBusinessAccountId: null,
  };

  // debug_token informando explicitamente quais contas o usuário autorizou.
  function debugResponse(targetIds: string[]) {
    return jsonResponse(200, {
      data: {
        is_valid: true,
        granular_scopes: [
          { scope: "whatsapp_business_management", target_ids: targetIds },
        ],
        scopes: ["whatsapp_business_management"],
      },
    });
  }

  function phonesResponse(ids: string[]) {
    return jsonResponse(200, {
      data: ids.map((id, index) => ({
        id,
        display_phone_number: `+55 11 90000-000${index}`,
        verified_name: `Número ${index}`,
      })),
    });
  }

  // Um `Response` só pode ter o corpo lido UMA vez. Reutilizar a mesma instância
  // em vários testes faz o corpo já consumido virar `{}` e o valor lido virar
  // nulo SEM erro nenhum — por isso cada teste recebe uma instância própria.
  function phoneDetailsResponse() {
    return jsonResponse(200, {
      display_phone_number: "+55 11 98888-7777",
      verified_name: "Estética da Ana",
    });
  }

  it("identificadores informados pela Meta: valida conta e número antes de concluir", async () => {
    const { calls, fetchImpl } = stubFetch([
      phonesResponse([PHONE_ID]),
      phoneDetailsResponse(),
    ]);

    const resolved = expectSuccess(
      await resolveConnectionTarget(baseInput, fetchImpl)
    );

    assert.equal(resolved.phoneNumberId, PHONE_ID);
    assert.equal(resolved.businessAccountId, WABA_A);
    assert.equal(resolved.displayPhoneNumber, "+55 11 98888-7777");
    assert.equal(resolved.verifiedName, "Estética da Ana");

    // 1) lê os números da conta informada (valida o WABA com o token);
    // 2) lê o número informado (valida que ele existe e é acessível).
    assert.equal(calls.length, 2);
    assert.equal(
      calls[0].url,
      `https://graph.facebook.com/v21.0/${WABA_A}/phone_numbers?fields=id%2Cdisplay_phone_number%2Cverified_name`
    );
    assert.equal(
      calls[1].url,
      `https://graph.facebook.com/v21.0/${PHONE_ID}?fields=display_phone_number%2Cverified_name`
    );
    for (const call of calls) {
      assert.equal(call.method, "GET");
      assert.equal(call.authorization, `Bearer ${ACCESS_TOKEN}`);
      // O token do WhatsApp nunca aparece na URL.
      assert.equal(call.url.includes(ACCESS_TOKEN), false);
    }
  });

  it("conta informada com um único número: conclui sem inventar identificador", async () => {
    const { calls, fetchImpl } = stubFetch([
      phonesResponse([PHONE_ID]),
      phoneDetailsResponse(),
    ]);

    const resolved = expectSuccess(
      await resolveConnectionTarget(
        { ...baseInput, providedPhoneNumberId: null },
        fetchImpl
      )
    );

    assert.equal(resolved.phoneNumberId, PHONE_ID);
    assert.equal(resolved.businessAccountId, WABA_A);
    assert.equal(calls.length, 2);
  });

  it("número escolhido fora da conta informada: PHONE_NOT_IN_WABA, sem alvo para gravar", async () => {
    const { calls, fetchImpl } = stubFetch([phonesResponse(["999"])]);

    const result = await resolveConnectionTarget(baseInput, fetchImpl);
    const failure = expectFailure(result);

    assert.equal(failure.code, "PHONE_NOT_IN_WABA");
    assert.equal("phoneNumberId" in result, false);
    assert.equal("businessAccountId" in result, false);
    // Só a listagem foi feita: o número nunca é confirmado antes de pertencer.
    assert.equal(calls.length, 1);
  });

  it("sem identificadores, uma conta com um número: conclui pela descoberta do token", async () => {
    const { calls, fetchImpl } = stubFetch([
      debugResponse([WABA_A]),
      phonesResponse([PHONE_ID]),
      phoneDetailsResponse(),
    ]);

    const resolved = expectSuccess(
      await resolveConnectionTarget(noIds, fetchImpl)
    );

    assert.equal(resolved.phoneNumberId, PHONE_ID);
    assert.equal(resolved.businessAccountId, WABA_A);
    assert.equal(resolved.displayPhoneNumber, "+55 11 98888-7777");

    // debug_token usa o token do APP; as leituras do WhatsApp usam o token da
    // organização.
    assert.equal(calls.length, 3);
    assert.equal(calls[0].authorization, `Bearer ${APP_ID}|${APP_SECRET}`);
    assert.equal(calls[1].authorization, `Bearer ${ACCESS_TOKEN}`);
    assert.equal(calls[2].authorization, `Bearer ${ACCESS_TOKEN}`);
    assert.equal(calls[0].url.includes(APP_SECRET), false);
  });

  it("várias contas autorizadas: ambiguidade com as opções e NADA para gravar", async () => {
    const { calls, fetchImpl } = stubFetch([
      debugResponse([WABA_A, WABA_B]),
      phonesResponse(["1111111"]),
      phonesResponse(["2222222", "3333333"]),
    ]);

    const result = await resolveConnectionTarget(noIds, fetchImpl);
    const ambiguous = expectAmbiguity(result);

    assert.equal(ambiguous.code, "WABA_SELECTION_REQUIRED");
    assert.deepEqual(
      ambiguous.accounts.map((account) => account.businessAccountId),
      [WABA_A, WABA_B]
    );
    // A primeira conta tem 1 número, a segunda tem 2: a UI consegue mostrar as
    // opções reais sem que o servidor escolha por ninguém.
    assert.equal((ambiguous.accounts[0].numbers ?? []).length, 1);
    assert.deepEqual(
      (ambiguous.accounts[1].numbers ?? []).map((number) => number.id),
      ["2222222", "3333333"]
    );

    // Nenhum alvo persistível: não existe phoneNumberId para salvar e o token
    // nunca viaja de volta na resposta.
    assert.equal("phoneNumberId" in result, false);
    assert.equal("accessToken" in result, false);
    assert.equal(JSON.stringify(result).includes(ACCESS_TOKEN), false);

    // debug_token + uma listagem por conta (nenhuma confirmação de número).
    assert.equal(calls.length, 3);
  });

  it("uma conta com vários números: PHONE_SELECTION_REQUIRED com os números e nada para gravar", async () => {
    const { calls, fetchImpl } = stubFetch([
      debugResponse([WABA_A]),
      phonesResponse(["1111111", "2222222"]),
    ]);

    const result = await resolveConnectionTarget(noIds, fetchImpl);
    const ambiguous = expectAmbiguity(result);

    assert.equal(ambiguous.code, "PHONE_SELECTION_REQUIRED");
    assert.equal(ambiguous.accounts.length, 1);
    assert.equal(ambiguous.accounts[0].businessAccountId, WABA_A);
    assert.deepEqual(
      (ambiguous.accounts[0].numbers ?? []).map((number) => number.id),
      ["1111111", "2222222"]
    );
    assert.equal("phoneNumberId" in result, false);

    // Nenhum número é confirmado: a escolha é da profissional.
    assert.equal(calls.length, 2);
  });

  it("sem escopo de gestão do WhatsApp: WABA_SCOPES_MISSING, nunca um palpite", async () => {
    const { calls, fetchImpl } = stubFetch([
      jsonResponse(200, {
        data: { is_valid: true, scopes: ["public_profile"] },
      }),
    ]);

    const result = await resolveConnectionTarget(noIds, fetchImpl);
    const failure = expectFailure(result);

    assert.equal(failure.code, "WABA_SCOPES_MISSING");
    assert.equal(failure.message.includes("conta comercial"), true);
    assert.equal(failure.message.includes(ACCESS_TOKEN), false);
    assert.equal(failure.message.includes(APP_SECRET), false);
    assert.equal("phoneNumberId" in result, false);
    assert.equal(calls.length, 1);
  });

  it("com escopo de gestão mas sem alvo informado: WABA_NOT_RESOLVED", async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(200, {
        data: {
          is_valid: true,
          granular_scopes: [
            { scope: "whatsapp_business_management", target_ids: [] },
          ],
          scopes: ["whatsapp_business_management"],
        },
      }),
    ]);

    const result = await resolveConnectionTarget(noIds, fetchImpl);

    assert.equal(expectFailure(result).code, "WABA_NOT_RESOLVED");
    assert.equal("phoneNumberId" in result, false);
  });

  it("token inválido na descoberta: WABA_TOKEN_INVALID, sem vazar credenciais", async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(200, { data: { is_valid: false } }),
    ]);

    const result = await resolveConnectionTarget(noIds, fetchImpl);
    const failure = expectFailure(result);

    assert.equal(failure.code, "WABA_TOKEN_INVALID");
    assert.equal(failure.message.includes(ACCESS_TOKEN), false);
    assert.equal(failure.message.includes(APP_SECRET), false);
    assert.equal("phoneNumberId" in result, false);
  });

  it("sem App ID/App Secret não há como descobrir a conta: PLATFORM_NOT_CONFIGURED e nenhuma chamada", async () => {
    const { calls, fetchImpl } = stubFetch([]);

    const result = await resolveConnectionTarget(
      { ...noIds, appId: null, appSecret: null },
      fetchImpl
    );
    const failure = expectFailure(result);

    assert.equal(failure.code, "PLATFORM_NOT_CONFIGURED");
    assert.equal(failure.message.includes(ACCESS_TOKEN), false);
    assert.equal("phoneNumberId" in result, false);
    // Nada é tentado na Meta sem as credenciais do app.
    assert.equal(calls.length, 0);
  });

  it("número informado conclui mesmo quando a conta não pode ser descoberta: grava sem conta, nunca com palpite", async () => {
    const { calls, fetchImpl } = stubFetch([
      phoneDetailsResponse(),
      jsonResponse(200, {
        data: { is_valid: true, scopes: ["public_profile"] },
      }),
    ]);

    const resolved = expectSuccess(
      await resolveConnectionTarget(
        { ...baseInput, providedBusinessAccountId: null },
        fetchImpl
      )
    );

    // O número foi validado com o token; a conta comercial fica NULA porque a
    // descoberta não é possível sem o escopo de gestão — nunca inventamos.
    assert.equal(resolved.phoneNumberId, PHONE_ID);
    assert.equal(resolved.businessAccountId, null);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url.includes("debug_token"), true);
  });

  it("falha da Graph API ao validar a conta informada: WABA_LOOKUP_FAILED, sem alvo", async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(400, {
        error: { message: "Unsupported get request.", code: 100 },
      }),
    ]);

    const result = await resolveConnectionTarget(baseInput, fetchImpl);
    const failure = expectFailure(result);

    assert.equal(failure.code, "WABA_LOOKUP_FAILED");
    assert.equal(failure.message.includes("Unsupported get request."), true);
    assert.equal(failure.message.includes(ACCESS_TOKEN), false);
    assert.equal("phoneNumberId" in result, false);
    assert.equal("businessAccountId" in result, false);
  });

  it("isolamento: número de OUTRA organização nunca é aceito só porque foi informado", async () => {
    const { calls, fetchImpl } = stubFetch([
      jsonResponse(400, {
        error: {
          message: "(#100) Tried accessing nonexisting field",
          code: 100,
        },
      }),
    ]);

    const result = await resolveConnectionTarget(
      { ...baseInput, providedBusinessAccountId: null },
      fetchImpl
    );
    const failure = expectFailure(result);

    assert.equal(failure.code, "PHONE_NOT_AUTHORIZED");
    assert.equal("phoneNumberId" in result, false);
    assert.equal("businessAccountId" in result, false);
    assert.equal(failure.message.includes(ACCESS_TOKEN), false);
    // Nada além da verificação do próprio número foi tentado.
    assert.equal(calls.length, 1);
  });

  it("número informado ligado a DUAS contas autorizadas: ambiguidade em vez de palpite", async () => {
    const { fetchImpl } = stubFetch([
      phoneDetailsResponse(),
      debugResponse([WABA_A, WABA_B]),
      phonesResponse([PHONE_ID]),
      phonesResponse([PHONE_ID]),
    ]);

    const result = await resolveConnectionTarget(
      { ...baseInput, providedBusinessAccountId: null },
      fetchImpl
    );
    const ambiguous = expectAmbiguity(result);

    assert.equal(ambiguous.code, "WABA_SELECTION_REQUIRED");
    assert.deepEqual(
      ambiguous.accounts.map((account) => account.businessAccountId),
      [WABA_A, WABA_B]
    );
    assert.equal(ambiguous.accounts[0].numbers, null);
    assert.equal(ambiguous.accounts[1].numbers, null);
    assert.equal("phoneNumberId" in result, false);
    assert.equal(JSON.stringify(result).includes(ACCESS_TOKEN), false);
  });
});

describe("selectSinglePhoneNumber", () => {
  it("usa o único número da conta comercial", () => {
    const result = selectSinglePhoneNumber([
      {
        id: "1099887766",
        displayPhoneNumber: "+55 11 98888-7777",
        verifiedName: "Estética da Ana",
      },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.phoneNumberId, "1099887766");
  });

  it("zero números vira WABA_PHONE_NOT_FOUND (nada é inventado)", () => {
    const result = selectSinglePhoneNumber([]);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, "WABA_PHONE_NOT_FOUND");
  });

  it("vários números viram WABA_PHONE_AMBIGUOUS (o servidor não escolhe)", () => {
    const result = selectSinglePhoneNumber([
      { id: "111", displayPhoneNumber: null, verifiedName: null },
      { id: "222", displayPhoneNumber: null, verifiedName: null },
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, "WABA_PHONE_AMBIGUOUS");
    assert.equal("phoneNumberId" in result, false);
  });
});
