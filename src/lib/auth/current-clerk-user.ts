import { auth } from "@clerk/nextjs/server";
import { getInternalUserByClerkId } from "@/lib/auth/clerk-user";

export async function getCurrentClerkUser() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  return getInternalUserByClerkId(userId);
}
