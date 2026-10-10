import { z } from "zod";
import {
  PROTOCOL_KINDS,
  PROTOCOL_KIND_LABELS,
  isProtocolKind,
  type ProtocolKind,
} from "@/lib/protocols/kinds";

// Os rótulos e a checagem de tipo vivem em `@/lib/protocols/kinds` (módulo puro,
// seguro para o navegador). Aqui ficam apenas os schemas de validação.
export { PROTOCOL_KINDS, PROTOCOL_KIND_LABELS, isProtocolKind };
export type { ProtocolKind };

export const protocolMetadataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe um nome com pelo menos 2 caracteres.")
    .max(160, "Nome muito longo."),
  description: z
    .string()
    .trim()
    .max(500, "Descrição muito longa.")
    .optional()
    .or(z.literal("")),
  protocolKind: z.enum(PROTOCOL_KINDS),
  autoSend: z.boolean().optional(),
});

export type ProtocolMetadataInput = z.infer<typeof protocolMetadataSchema>;

export const updateProtocolSchema = protocolMetadataSchema.partial();
export type UpdateProtocolInput = z.infer<typeof updateProtocolSchema>;
