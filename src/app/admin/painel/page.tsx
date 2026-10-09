import { redirect } from "next/navigation";
import { isCurrentUserSupportAdmin } from "@/lib/support/admin";
import { PlatformPanel } from "./platform-panel";

// Painel estratégico INTERNO da plataforma EstetiQI. O guard roda no servidor
// antes de renderizar: quem não está na allowlist (ou não tem sessão) é
// redirecionado para o app. A API em /api/admin/panel revalida no servidor, de
// modo que esconder a tela nunca é a única proteção.
export const dynamic = "force-dynamic";

export default async function AdminPainelPage() {
  const isAdmin = await isCurrentUserSupportAdmin();

  if (!isAdmin) {
    redirect("/app");
  }

  return <PlatformPanel />;
}
