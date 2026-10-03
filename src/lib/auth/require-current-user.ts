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
