import { auth } from "@clerk/nextjs/server";
import { getInternalUserByClerkId } from "@/lib/auth/clerk-user";
import { ensureClerkUser } from "@/lib/auth/ensure-clerk-user";

export async function requireCurrentUser() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("UNAUTHENTICATED");
  }

  let currentUser = await getInternalUserByClerkId(userId);

  if (!currentUser) {
    currentUser = await ensureClerkUser();
  }

  // Bloqueio da organizacao (administracao da plataforma). Efetivo no servidor:
  // nenhuma API autenticada executa quando a organizacao esta bloqueada. Os
  // dados permanecem intactos; apenas o acesso e negado.
  if (currentUser.organization_status === "blocked") {
    throw new Error("ORGANIZATION_BLOCKED");
  }

  return {
    user: {
      id: currentUser.user_id,
      name: currentUser.user_name,
      email: currentUser.email,
    },
    organization: {
      id: currentUser.organization_id,
      name: currentUser.organization_name,
      slug: currentUser.organization_slug,
    },
    role: currentUser.role,
    expiresAt: null,
  };
}
