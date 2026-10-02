import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AppPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get("estetiqi_session");

  if (!session) {
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
            Área da plataforma
          </h1>

          <p className="mt-3 text-[#78867f]">
            Login realizado com sucesso.
          </p>
        </div>
      </div>
    </main>
  );
}