import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { sql } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import {
  normalizeCpf,
  normalizePhone,
} from "@/lib/normalization/brazil";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

type ImportRow = {
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  birthDate: string | null;
  notes: string | null;
  source: string;
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function valueOf(row: Record<string, unknown>, names: string[]) {
  const entries = Object.entries(row);

  for (const name of names) {
    const target = normalizeHeader(name);

    const found = entries.find(
      ([key]) => normalizeHeader(key) === target
    );

    if (found) {
      const value = found[1];

      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
  }

  return null;
}

function normalizeBirthDate(value: string | null) {
  if (!value) return null;

  const text = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const br = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);

  if (br) {
    const [, day, month, year] = br;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

function parseFile(buffer: Buffer): ImportRow[] {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!firstSheet) {
    throw new Error("ARQUIVO_SEM_PLANILHA");
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    firstSheet,
    {
      defval: "",
      raw: false,
    }
  );

  if (rows.length === 0) {
    throw new Error("ARQUIVO_VAZIO");
  }

  if (rows.length > MAX_ROWS) {
    throw new Error(`LIMITE_DE_LINHAS_EXCEDIDO_${MAX_ROWS}`);
  }

  return rows.map((row) => ({
    name:
      valueOf(row, [
        "nome",
        "name",
        "cliente",
        "nome completo",
        "cliente nome",
      ]) ?? "",

    phone: normalizePhone(
      valueOf(row, [
        "telefone",
        "phone",
        "celular",
        "whatsapp",
        "telefone celular",
      ])
    ),

    email: valueOf(row, [
      "email",
      "e-mail",
      "correo",
    ])?.toLowerCase() ?? null,

    cpf: normalizeCpf(
      valueOf(row, [
        "cpf",
        "documento",
      ])
    ),

    birthDate: normalizeBirthDate(
      valueOf(row, [
        "nascimento",
        "data nascimento",
        "data de nascimento",
        "birth date",
        "birthdate",
      ])
    ),

    notes: valueOf(row, [
      "observacoes",
      "observacoes gerais",
      "observação",
      "observacoes",
      "notes",
    ]),

    source: "import",
  }));
}

function validateRows(rows: ImportRow[]) {
  const valid: ImportRow[] = [];
  const errors: Array<{
    row: number;
    error: string;
  }> = [];

  rows.forEach((row, index) => {
    if (!row.name || row.name.length < 2) {
      errors.push({
        row: index + 2,
        error: "Nome não informado ou inválido.",
      });
      return;
    }

    if (row.name.length > 120) {
      errors.push({
        row: index + 2,
        error: "Nome excede 120 caracteres.",
      });
      return;
    }

    if (row.email && row.email.length > 255) {
      errors.push({
        row: index + 2,
        error: "E-mail excede 255 caracteres.",
      });
      return;
    }

    if (row.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.birthDate)) {
      errors.push({
        row: index + 2,
        error: "Data de nascimento inválida.",
      });
      return;
    }

    valid.push(row);
  });

  return { valid, errors };
}

async function readFile(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("ARQUIVO_NAO_ENVIADO");
  }

  if (file.size === 0) {
    throw new Error("ARQUIVO_VAZIO");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("ARQUIVO_MUITO_GRANDE");
  }

  const name = file.name.toLowerCase();

  if (
    !name.endsWith(".xlsx") &&
    !name.endsWith(".xls") &&
    !name.endsWith(".csv")
  ) {
    throw new Error("FORMATO_NAO_SUPORTADO");
  }

  return Buffer.from(await file.arrayBuffer());
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
    const organizationId = currentUser.organization.id;

    const formData = await request.clone().formData();
    const action = String(formData.get("action") ?? "preview");

    const buffer = await readFile(request);
    const rows = parseFile(buffer);
    const { valid, errors } = validateRows(rows);

    if (action === "preview") {
      const phones = valid
        .map((row) => row.phone)
        .filter(Boolean);

      const emails = valid
        .map((row) => row.email)
        .filter(Boolean);

      const cpfs = valid
        .map((row) => row.cpf)
        .filter(Boolean);

      const existing = await sql`
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
        total: rows.length,
        valid: valid.length,
        errors,
        existing,
        preview: valid.slice(0, 100),
      });
    }

    if (action !== "import") {
      return NextResponse.json(
        { error: "AÇÃO_INVÁLIDA" },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      const imported: string[] = [];
      const skipped: Array<{
        row: number;
        reason: string;
        name: string;
      }> = [];

      const existing = await client.query(
        `
        SELECT id, name, phone, email, cpf
        FROM clients
        WHERE organization_id = $1
        `,
        [organizationId]
      );

      const usedPhones = new Set(
        existing.rows
          .map((row) => row.phone)
          .filter(Boolean)
      );

      const usedEmails = new Set(
        existing.rows
          .map((row) => row.email)
          .filter(Boolean)
      );

      const usedCpfs = new Set(
        existing.rows
          .map((row) => row.cpf)
          .filter(Boolean)
      );

      const importedKeys = new Set<string>();

      for (let index = 0; index < valid.length; index++) {
        const row = valid[index];
        const originalRow = rows.indexOf(row) + 2;

        const duplicate =
          (row.phone && usedPhones.has(row.phone)) ||
          (row.email && usedEmails.has(row.email)) ||
          (row.cpf && usedCpfs.has(row.cpf));

        const internalKey =
          row.cpf
            ? `cpf:${row.cpf}`
            : row.email
              ? `email:${row.email}`
              : row.phone
                ? `phone:${row.phone}`
                : `name:${row.name.toLowerCase()}`;

        if (duplicate || importedKeys.has(internalKey)) {
          skipped.push({
            row: originalRow,
            reason: duplicate
              ? "Cliente já existe."
              : "Cliente duplicado no arquivo.",
            name: row.name,
          });

          continue;
        }

        const inserted = await client.query(
          `
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
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, 'active', $8
          )
          RETURNING id
          `,
          [
            organizationId,
            row.name,
            row.phone,
            row.email,
            row.cpf,
            row.birthDate,
            row.notes,
            row.source,
          ]
        );

        imported.push(inserted.rows[0].id);

        importedKeys.add(internalKey);

        if (row.phone) usedPhones.add(row.phone);
        if (row.email) usedEmails.add(row.email);
        if (row.cpf) usedCpfs.add(row.cpf);
      }

      return {
        imported: imported.length,
        skipped,
      };
    });

    return NextResponse.json({
      ok: true,
      ...result,
      errors,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "IMPORT_ERROR";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    const knownErrors = new Set([
      "ARQUIVO_NAO_ENVIADO",
      "ARQUIVO_VAZIO",
      "ARQUIVO_MUITO_GRANDE",
      "FORMATO_NAO_SUPORTADO",
      "ARQUIVO_SEM_PLANILHA",
    ]);

    return NextResponse.json(
      {
        error: knownErrors.has(message)
          ? message
          : "IMPORT_ERROR",
      },
      { status: 400 }
    );
  }
}
