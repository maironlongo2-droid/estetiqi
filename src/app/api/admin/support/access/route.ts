import { isCurrentUserSupportAdmin } from "@/lib/support/admin";

// Sinaliza apenas se o usuário logado é administrador da plataforma, para
// decidir se a interface mostra o acesso à central administrativa. Não expõe
// dado algum de suporte e não é fronteira de segurança (a proteção real está
// nas APIs de /api/admin/support/*). Qualquer erro → { admin: false }.
export async function GET() {
  try {
    const admin = await isCurrentUserSupportAdmin();

    return Response.json({ admin });
  } catch (error) {
    console.error("Support admin access error:", error);

    return Response.json({ admin: false });
  }
}
