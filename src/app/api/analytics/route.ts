import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { getBusinessMetrics } from "@/lib/analytics/business-metrics";

export async function GET() {
  const currentUser = await requireCurrentUser();

  const metrics = await getBusinessMetrics(
    currentUser.organization.id
  );

  return Response.json(metrics);
}
