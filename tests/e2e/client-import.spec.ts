import { expect, test } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import * as XLSX from "xlsx";

function spreadsheetFile(
  name: string,
  bookType: "xls" | "xlsx",
  rows: unknown[][]
) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType });

  return {
    name,
    mimeType:
      bookType === "xls"
        ? "application/vnd.ms-excel"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(buffer),
  };
}

test("importação aceita CSV UTF-8, XLS/XLSX e apresenta resultado parcial", async ({
  page,
}) => {
  await page.goto("/login");
  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  const suffix = Date.now();
  const csvFile = {
    name: "clientes-acentos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Nome,Telefone,E-mail,Data de nascimento,Observações",
        `"Érica Souza ${suffix}",2198765432,erica-${suffix}@example.com,1990-02-28,"Cliente com acentuação"`,
        `"Duplicada ${suffix}",2198765432,duplicada-${suffix}@example.com,28/02/1990,"Duplicada no arquivo"`,
        `"Data inválida ${suffix}",2198765433,invalida-${suffix}@example.com,31/02/1990,"Data inválida"`,
      ].join("\n"),
      "utf8"
    ),
  };

  const csvPreviewResponse = await page.request.post("/api/clients/import", {
    multipart: { action: "preview", file: csvFile },
  });
  expect(csvPreviewResponse.ok()).toBeTruthy();
  const csvPreview = await csvPreviewResponse.json();
  expect(csvPreview.preview[0].name).toBe(`Érica Souza ${suffix}`);
  expect(csvPreview.preview[0].birthDate).toBe("1990-02-28");
  expect(csvPreview.invalid).toBe(1);
  expect(csvPreview.errors[0].row).toBe(4);

  for (const bookType of ["xls", "xlsx"] as const) {
    const formatFile = spreadsheetFile(
      `clientes-${bookType}.${bookType}`,
      bookType,
      [
        ["Nome", "Telefone", "E-mail", "Data de nascimento"],
        [
          `Planilha ${bookType} ${suffix}`,
          `21987654${bookType === "xls" ? "34" : "35"}`,
          `${bookType}-${suffix}@example.com`,
          32874,
        ],
      ]
    );
    const response = await page.request.post("/api/clients/import", {
      multipart: { action: "preview", file: formatFile },
    });
    expect(response.ok()).toBeTruthy();
    const preview = await response.json();
    expect(preview.valid).toBe(1);
    expect(preview.preview[0].birthDate).toBe("1990-01-01");
  }

  try {
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Importar clientes" }).click();
    await page.locator('input[type="file"]').setInputFiles(csvFile);
    await page.getByRole("button", { name: "Analisar arquivo" }).click();
    await expect(
      page.getByText(
        "Data de nascimento inválida ou em formato não suportado."
      )
    ).toBeVisible();

    const importResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/clients/import") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Confirmar importação" }).click();
    const importResponse = await importResponsePromise;
    expect(importResponse.ok()).toBeTruthy();
    const result = await importResponse.json();
    expect(result.summary).toEqual({
      total: 3,
      imported: 1,
      skipped: 1,
      invalid: 1,
    });
    await expect(page.getByText("Total processado")).toBeVisible();
    await expect(page.getByText("Duplicados ignorados")).toBeVisible();
    await expect(
      page.getByText("Importação concluída com pendências.")
    ).toBeVisible();
    await expect(
      page.getByText(
        "Linha 4: Data de nascimento inválida ou em formato não suportado."
      )
    ).toBeVisible();
    await expect(
      page.getByText(
        `Linha 3 (Duplicada ${suffix}): Cliente já existe.`
      )
    ).toBeVisible();
    await expect(
      page.getByText(`Érica Souza ${suffix}`, { exact: true })
    ).toBeVisible();
  } finally {
    const created = await page.request.get(
      `/api/clients?status=active&search=${encodeURIComponent(`Érica Souza ${suffix}`)}`
    );
    if (created.ok()) {
      const data = await created.json();
      const importedClient = data.clients.find(
        (client: { name: string }) => client.name === `Érica Souza ${suffix}`
      );
      if (importedClient) {
        const deleted = await page.request.delete(
          `/api/clients/${importedClient.id}`,
          {
          data: { confirmation: "DELETE_PERMANENTLY" },
          }
        );
        expect(deleted.ok()).toBeTruthy();
      }
    }
  }
});
