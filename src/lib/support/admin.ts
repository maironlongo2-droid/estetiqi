import { auth, currentUser } from "@clerk/nextjs/server";
import { isSupportAdminEmail } from "@/lib/support/admin-policy";

// Identidade do administrador da PLATAFORMA EstetiQI (não confundir com o
// admin/owner de uma organização cliente, que é resolvido por RBAC).
export type SupportAdminIdentity = {
  clerkUserId: string;
  email: string;
};

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

// A autorização só considera e-mails VERIFICADOS das contas Clerk. Um e-mail
// não verificado nunca confere privilégio, mesmo que conste na allowlist.
function verifiedEmails(clerkUser: ClerkUser): string[] {
  return clerkUser.emailAddresses
    .filter((item) => item.verification?.status === "verified")
    .map((item) => item.emailAddress);
}

// Lança "UNAUTHENTICATED" (401) quando não há sessão e "FORBIDDEN" (403) quando
// a sessão existe mas o e-mail verificado não pertence à allowlist. Sempre
// falha fechado: sem SUPPORT_ADMIN_EMAILS configurada, ninguém passa.
export async function requireSupportAdmin(): Promise<SupportAdminIdentity> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("UNAUTHENTICATED");
  }

  const clerkUser = await currentUser();

  const matchedEmail = clerkUser
    ? verifiedEmails(clerkUser).find((email) => isSupportAdminEmail(email))
    : undefined;

  if (!matchedEmail) {
    throw new Error("FORBIDDEN");
  }

  return {
    clerkUserId: userId,
    email: matchedEmail.toLowerCase(),
  };
}

// Versão não lançada usada para decidir se exibimos (ou não) o acesso à central
// administrativa. Qualquer dúvida → false.
export async function isCurrentUserSupportAdmin(): Promise<boolean> {
  const { userId } = await auth();

  if (!userId) {
    return false;
  }

  const clerkUser = await currentUser();

  if (!clerkUser) {
    return false;
  }

  return verifiedEmails(clerkUser).some((email) => isSupportAdminEmail(email));
}
