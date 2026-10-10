// Tipos de protocolo de procedimento — módulo PURO (sem dependências) para poder
// ser usado tanto no servidor quanto em componentes de navegador, sem arrastar
// bibliotecas de validação para o bundle do cliente.

export const PROTOCOL_KINDS = ["pre", "post"] as const;

export type ProtocolKind = (typeof PROTOCOL_KINDS)[number];

export const PROTOCOL_KIND_LABELS: Record<ProtocolKind, string> = {
  pre: "Pré-procedimento",
  post: "Pós-procedimento",
};

export function isProtocolKind(value: unknown): value is ProtocolKind {
  return (
    typeof value === "string" &&
    (PROTOCOL_KINDS as readonly string[]).includes(value)
  );
}
