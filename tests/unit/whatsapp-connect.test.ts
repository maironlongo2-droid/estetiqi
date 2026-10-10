// Testes unitários da CONEXÃO oficial do WhatsApp (Embedded Signup / Meta).
//
// Rodam com o runner nativo do Node (`npm run test:unit`): sem banco, sem rede e
// sem segredo algum. O `fetch` é INJETADO, então a URL exata, o cabeçalho de
// autorização e o tratamento das respostas podem ser conferidos sem chamar a
// Meta.
//
// Por que estes casos importam: o Embedded Signup atual permite concluir o fluxo
// SEM que a Meta informe qual número foi escolhido (inclusive sem número algum).
// É por `fetchWabaPhoneNumbers` que o número é localizado na conta comercial
// autorizada. Um erro aqui significa vincular a organização ao número errado,
// vincular sem número válido ou afirmar uma conexão que não aconteceu.
// O token NUNCA pode aparecer em mensagem de erro.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchWabaPhoneNumbers } from "../../src/lib/communication/whatsapp-connect.ts";

const WABA_ID = "1099887766554433";
const ACCESS_TOKEN = "token-secreto-da-organizacao";

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
