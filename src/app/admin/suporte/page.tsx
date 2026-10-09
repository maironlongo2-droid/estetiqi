import { redirect } from "next/navigation";
import { isCurrentUserSupportAdmin } from "@/lib/support/admin";
import { SupportAdmin } from "./support-admin";

// A central administrativa é exclusiva do responsável pela plataforma. O guard
// roda no servidor antes de renderizar qualquer coisa: quem não está na
// allowlist (ou não tem sessão) é redirecionado. As APIs também revalidam, então
// esconder a tela nunca é a única proteção.
export const dynamic = "force-dynamic";

export default async function AdminSuportePage() {
  const isAdmin = await isCurrentUserSupportAdmin();

  if (!isAdmin) {
    redirect("/app");
  }

  return <SupportAdmin />;
}
