import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AppPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("estetiqi_session");

  if (!sessionCookie?.value) {
    redirect("/login");
  }

  const request = new Request("http://estetiqi.local/app", {
    headers: {
      cookie: `estetiqi_session=${sessionCookie.value}`,
    },
  });

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[#fbfaf8] p-8 text-[#26352f]">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[2rem] border border-[#dfe9e3] bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#9a7a84]">
            EstetiQi
          </p>

          <h1 className="mt-3 text-3xl font-semibold text-[#30463c]">
            Olá, {currentUser.user.name}
          </h1>

          <p className="mt-3 text-[#78867f]">
            Você está conectado à organização{" "}
            <strong>{currentUser.organization.name}</strong>.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#e4ebe7] p-5">
              <p className="text-sm text-[#78867f]">Organização</p>
              <p className="mt-1 font-semibold text-[#30463c]">
                {currentUser.organization.name}
              </p>
            </div>

            <div className="rounded-2xl border border-[#e4ebe7] p-5">
              <p className="text-sm text-[#78867f]">Perfil</p>
              <p className="mt-1 font-semibold text-[#30463c]">
                {currentUser.role}
              </p>
            </div>

            <div className="rounded-2xl border border-[#e4ebe7] p-5">
              <p className="text-sm text-[#78867f]">E-mail</p>
              <p className="mt-1 break-all font-semibold text-[#30463c]">
                {currentUser.user.email}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
