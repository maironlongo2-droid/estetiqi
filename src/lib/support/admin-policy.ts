// Política de identificação do administrador da plataforma EstetiQI.
//
// Este módulo é intencionalmente puro (não importa Clerk nem Next): recebe os
// e-mails JÁ VERIFICADOS resolvidos no servidor e decide se pertencem à
// allowlist configurada. Isso mantém a decisão testável e impede que qualquer
// e-mail enviado pelo navegador sirva como fonte de autorização.
//
// A allowlist vem da variável de ambiente SUPPORT_ADMIN_EMAILS (e-mails
// separados por vírgula). Sempre que a variável não estiver definida (ou
// vazia), NINGUÉM é administrador: negamos por padrão.

export function getSupportAdminEmails(): string[] {
  const raw = process.env.SUPPORT_ADMIN_EMAILS;

  if (!raw) {
    return [];
  }

  return [
    ...new Set(
      raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

// Comparação sempre normalizada (lowercase + trim). O e-mail precisa estar na
// allowlist; caso contrário, o acesso é negado.
export function isSupportAdminEmail(
  email: string | null | undefined
): boolean {
  if (!email) {
    return false;
  }

  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return getSupportAdminEmails().includes(normalized);
}
