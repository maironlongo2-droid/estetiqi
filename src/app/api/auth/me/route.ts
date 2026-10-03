import { requireCurrentUser } from "@/lib/auth/require-current-user";

export async function GET() {
  const currentUser = await requireCurrentUser();

  return Response.json({
    user: currentUser.user,
    organization: currentUser.organization,
    role: currentUser.role,
  });
}
