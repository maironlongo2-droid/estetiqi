import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { sql } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { normalizeCpf, normalizePhone } from "@/lib/normalization/brazil";
import { createClientSchema } from "@/lib/validation/client";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD = 64 * 1024;
const MAX_ROWS = 5000;
const INSERT_BATCH_SIZE = 500;

type ImportClient = {
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  birthDate: string | null;
  notes: string | null;
  source: string;
};

type ImportRow = ImportClient & {
  rowNumber: number;
};

type InsertableImportRow = ImportRow & { organizationId: string };

type RowError = {
  row: number;
  error: string;
};

class ImportInputError extends Error {}

const inputErrorMessages: Record<string, string> = {
  ARQUIVO_NAO_ENVIADO: "Selecione um arquivo para importar.",
  ARQUIVO_VAZIO: "O arquivo está vazio ou não contém linhas para importar.",
  ARQUIVO_MUITO_GRANDE: "O arquivo excede o limite de 10 MB.",
  FORMATO_NAO_SUPORTADO: "Formato não suportado. Envie CSV, XLS ou XLSX.",
  ARQUIVO_SEM_PLANILHA: "O arquivo não contém uma planilha válida.",
  ARQUIVO_INVALIDO: "Não foi possível ler o arquivo. Verifique o formato e tente novamente.",
  FORMULARIO_INVALIDO: "Não foi possível receber o arquivo. Tente novamente.",
};

function inputError(message: string): never {
  throw new ImportInputError(message);
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function valueOf(
  headers: string[],
  values: unknown[],
  names: string[]
): unknown {
  for (const name of names) {
    const target = normalizeHeader(name);
    const index = headers.findIndex(
      (header) => normalizeHeader(header) === target
    );

    if (index !== -1) {
      const value = values[index];
      if (value !== undefined && value !== null && String(value).trim()) {
        return value;
      }
    }
  }

  return null;
}

function cellText(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function datePartsToIso(year: number, month: number, day: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    year > 9999
  ) {
    return null;
  }

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeBirthDate(value: unknown, allowExcelSerial: boolean) {
  if (value === undefined || value === null || value === "") {
    return { date: null, error: null };
  }

  if (value instanceof Date) {
    const date = datePartsToIso(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate()
    );
    return date
      ? { date, error: null }
      : { date: null, error: "Data de nascimento inválida." };
  }

  if (typeof value === "number" && allowExcelSerial) {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts) {
      const date = datePartsToIso(parts.y, parts.m, parts.d);
      return date
        ? { date, error: null }
        : { date: null, error: "Data de nascimento inválida." };
    }
    return { date: null, error: "Data de nascimento inválida." };
  }

  const text = cellText(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const date = iso
    ? datePartsToIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    : br
      ? datePartsToIso(Number(br[3]), Number(br[2]), Number(br[1]))
      : null;

  return date
    ? { date, error: null }
    : { date: null, error: "Data de nascimento inválida ou em formato não suportado." };
}

function parseFile(buffer: Buffer, fileName: string): unknown[][] {
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      ...(isCsv ? { codepage: 65001 } : {}),
    });
  } catch {
    inputError("ARQUIVO_INVALIDO");
  }

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet || !firstSheet["!ref"]) {
    inputError("ARQUIVO_SEM_PLANILHA");
  }

  let range: XLSX.Range;
  try {
    range = XLSX.utils.decode_range(firstSheet["!ref"]);
  } catch {
    inputError("ARQUIVO_INVALIDO");
  }

  if (range.e.r - range.s.r > MAX_ROWS) {
    inputError(`LIMITE_DE_LINHAS_EXCEDIDO_${MAX_ROWS}`);
  }

  let matrix: unknown[][];
  try {
    matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: true,
    });
  } catch {
    inputError("ARQUIVO_INVALIDO");
  }

  if (matrix.length < 2) {
    inputError("ARQUIVO_VAZIO");
  }

  return matrix;
}

function validateRows(matrix: unknown[][], isSpreadsheet: boolean) {
  const headers = (matrix[0] ?? []).map(cellText);
  const valid: ImportRow[] = [];
  const errors: RowError[] = [];
  let total = 0;

  matrix.slice(1).forEach((values, index) => {
    if (values.every((value) => !cellText(value))) return;
    total += 1;
    const rowNumber = index + 2;

    const rawName = cellText(
      valueOf(headers, values, [
        "nome",
        "name",
        "cliente",
        "nome completo",
        "cliente nome",
      ])
    );
    const rawPhone = cellText(
      valueOf(headers, values, [
        "telefone",
        "phone",
        "celular",
        "whatsapp",
        "telefone celular",
      ])
    );
    const rawEmail = cellText(
      valueOf(headers, values, ["email", "e-mail", "correo"])
    ).toLowerCase();
    const rawCpf = cellText(
      valueOf(headers, values, ["cpf", "documento"])
    );
    const rawNotes = cellText(
      valueOf(headers, values, [
        "observacoes",
        "observacoes gerais",
        "observação",
        "notes",
      ])
    );
    const birthDateResult = normalizeBirthDate(
      valueOf(headers, values, [
        "nascimento",
        "data nascimento",
        "data de nascimento",
        "birth date",
        "birthdate",
      ]),
      isSpreadsheet
    );

    if (birthDateResult.error) {
      errors.push({ row: rowNumber, error: birthDateResult.error });
      return;
    }

    const parsed = createClientSchema.safeParse({
      name: rawName,
      phone: rawPhone,
      email: rawEmail,
      cpf: rawCpf,
      birthDate: birthDateResult.date ?? "",
      notes: rawNotes,
      source: "import",
      status: "active",
    });

    if (!parsed.success) {
      const firstFieldError = Object.values(
        parsed.error.flatten().fieldErrors
      ).flat()[0];
      errors.push({
        row: rowNumber,
        error: firstFieldError ?? "Dados do cliente inválidos.",
      });
      return;
    }

    valid.push({
      rowNumber,
      name: parsed.data.name,
      phone: normalizePhone(parsed.data.phone),
      email: parsed.data.email || null,
      cpf: normalizeCpf(parsed.data.cpf),
      birthDate: birthDateResult.date,
      notes: parsed.data.notes || null,
      source: "import",
    });
  });

  return { valid, errors, total };
}

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) inputError("ARQUIVO_NAO_ENVIADO");
  if (file.size === 0) inputError("ARQUIVO_VAZIO");
  if (file.size > MAX_FILE_SIZE) inputError("ARQUIVO_MUITO_GRANDE");

  const fileName = file.name.toLowerCase();
  if (
    !fileName.endsWith(".xlsx") &&
    !fileName.endsWith(".xls") &&
    !fileName.endsWith(".csv")
  ) {
    inputError("FORMATO_NAO_SUPORTADO");
  }

  return {
    fileName,
    buffer: Buffer.from(await file.arrayBuffer()),
  };
}

function rowInternalKey(row: ImportClient) {
  return row.cpf
    ? `cpf:${row.cpf}`
    : row.email
      ? `email:${row.email}`
      : row.phone
        ? `phone:${row.phone}`
        : `name:${row.name.toLowerCase()}`;
}

function insertStatement(rows: InsertableImportRow[]) {
  const values: unknown[] = [];
  const tuples = rows.map((row, rowIndex) => {
    const offset = rowIndex * 8;
    values.push(
      row.organizationId,
      row.name,
      row.phone,
      row.email,
      row.cpf,
      row.birthDate,
      row.notes,
      row.source
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, 'active', $${offset + 8})`;
  });

  return {
    values,
    query: `
      INSERT INTO clients (
        organization_id,
        name,
        phone,
        email,
        cpf,
        birth_date,
        notes,
        status,
        source
      )
      VALUES ${tuples.join(", ")}
      RETURNING id
    `,
  };
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "clients", "create")) {
      return Response.json(
        { error: "Você não tem permissão para criar clientes." },
        { status: 403 }
      );
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD
    ) {
      inputError("ARQUIVO_MUITO_GRANDE");
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      inputError("FORMULARIO_INVALIDO");
    }

    const action = String(formData.get("action") ?? "preview");
    if (action !== "preview" && action !== "import") {
      return NextResponse.json(
        { error: "AÇÃO_INVÁLIDA" },
        { status: 400 }
      );
    }

    const { fileName, buffer } = await readUpload(formData);
    const matrix = parseFile(buffer, fileName);
    const { valid, errors, total } = validateRows(
      matrix,
      !fileName.endsWith(".csv")
    );
    const organizationId = currentUser.organization.id;

    if (action === "preview") {
      const phones = valid
        .map((row) => row.phone)
        .filter((value): value is string => Boolean(value));
      const emails = valid
        .map((row) => row.email)
        .filter((value): value is string => Boolean(value));
      const cpfs = valid
        .map((row) => row.cpf)
        .filter((value): value is string => Boolean(value));

      const existing =
        phones.length + emails.length + cpfs.length === 0
          ? []
          : await sql`
              SELECT id, name, phone, email, cpf
              FROM clients
              WHERE organization_id = ${organizationId}
                AND (
                  (${phones.length > 0} AND phone = ANY(${phones}))
                  OR (${emails.length > 0} AND email = ANY(${emails}))
                  OR (${cpfs.length > 0} AND cpf = ANY(${cpfs}))
                )
            `;

      return NextResponse.json({
        ok: true,
        total,
        valid: valid.length,
        invalid: errors.length,
        errors,
        existing,
        preview: valid.slice(0, 100).map((row) => ({
          name: row.name,
          phone: row.phone,
          email: row.email,
          cpf: row.cpf,
          birthDate: row.birthDate,
          notes: row.notes,
          source: row.source,
        })),
      });
    }

    const result = await withTransaction(async (client) => {
      const skipped: Array<{
        row: number;
        reason: string;
        name: string;
      }> = [];
      const insertable: InsertableImportRow[] = [];

      const existing = await client.query(
        `
        SELECT id, name, phone, email, cpf
        FROM clients
        WHERE organization_id = $1
        `,
        [organizationId]
      );

      const usedPhones = new Set(
        existing.rows.map((row) => row.phone).filter(Boolean)
      );
      const usedEmails = new Set(
        existing.rows.map((row) => row.email).filter(Boolean)
      );
      const usedCpfs = new Set(
        existing.rows.map((row) => row.cpf).filter(Boolean)
      );
      const importedKeys = new Set<string>();

      for (const row of valid) {
        const duplicate =
          (row.phone && usedPhones.has(row.phone)) ||
          (row.email && usedEmails.has(row.email)) ||
          (row.cpf && usedCpfs.has(row.cpf));
        const internalKey = rowInternalKey(row);

        if (duplicate || importedKeys.has(internalKey)) {
          skipped.push({
            row: row.rowNumber,
            reason: duplicate
              ? "Cliente já existe."
              : "Cliente duplicado no arquivo.",
            name: row.name,
          });
          continue;
        }

        insertable.push({ ...row, organizationId });
        importedKeys.add(internalKey);
        if (row.phone) usedPhones.add(row.phone);
        if (row.email) usedEmails.add(row.email);
        if (row.cpf) usedCpfs.add(row.cpf);
      }

      let imported = 0;
      for (
        let start = 0;
        start < insertable.length;
        start += INSERT_BATCH_SIZE
      ) {
        const batch = insertable.slice(start, start + INSERT_BATCH_SIZE);
        const statement = insertStatement(batch);
        const inserted = await client.query(statement.query, statement.values);
        imported += inserted.rowCount ?? inserted.rows.length;
      }

      return { imported, skipped };
    });

    return NextResponse.json({
      ok: true,
      total,
      ...result,
      errors,
      summary: {
        total,
        imported: result.imported,
        skipped: result.skipped.length,
        invalid: errors.length,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    if (error instanceof ImportInputError) {
      const lineLimit = error.message.match(/^LIMITE_DE_LINHAS_EXCEDIDO_(\d+)$/);
      const message = lineLimit
        ? `O arquivo excede o limite de ${lineLimit[1]} linhas.`
        : inputErrorMessages[error.message] ??
          "O arquivo não pôde ser processado.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("Client import error:", error);
    return NextResponse.json(
      { error: "Não foi possível processar a importação." },
      { status: 500 }
    );
  }
}
