import { getCurrentUser } from "@/lib/auth/current-user";

export async function requireCurrentUser(request: Request) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw new Error("UNAUTHENTICATED");
  }

  return currentUser;
}