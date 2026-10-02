"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Não foi possível entrar.");
        return;
      }

      router.push("/app");
      router.refresh();
    } catch {
      setError(
        "Não foi possível conectar ao EstetiQi. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fbfaf8] text-[#26352f]">
      <div className="pointer-events-none absolute left-0 top-0 h-96 w-96 rounded-full bg-[#dceee4] opacity-50 blur-3xl" />

      <div className="pointer-events-none absolute right-0 top-40 h-80 w-80 rounded-full bg-[#f5dfe4] opacity-40 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#dceee4] text-2xl text-[#527765] shadow-sm">
              ✦
            </div>

            <div className="mt-4 text-2xl font-semibold tracking-[0.18em] text-[#30463c]">
              Esteti<span className="text-[#7a9f8d]">Qi</span>
            </div>

            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.28em] text-[#91a39b]">
              Beauty Intelligence
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#dfe9e3] bg-white p-7 shadow-[0_25px_80px_rgba(64,91,78,0.12)] sm:p-9">
            <div>
              <h1 className="text-2xl font-semibold text-[#30463c]">
                Bem-vindo de volta
              </h1>

              <p className="mt-2 text-sm leading-6 text-[#78867f]">
                Entre na sua conta para acessar o EstetiQi.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-7 space-y-5"
            >
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-[#52645b]"
                >
                  E-mail
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  required
                  className="w-full rounded-2xl border border-[#dce6e0] bg-[#fbfcfb] px-4 py-3 text-sm text-[#30463c] outline-none transition placeholder:text-[#a0aaa5] focus:border-[#7a9f8d] focus:ring-4 focus:ring-[#dceee4]"
                  placeholder="seu@email.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-[#52645b]"
                >
                  Senha
                </label>

                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  required
                  className="w-full rounded-2xl border border-[#dce6e0] bg-[#fbfcfb] px-4 py-3 text-sm text-[#30463c] outline-none transition placeholder:text-[#a0aaa5] focus:border-[#7a9f8d] focus:ring-4 focus:ring-[#dceee4]"
                  placeholder="Sua senha"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-2xl border border-[#efd5da] bg-[#fff5f6] px-4 py-3 text-sm leading-6 text-[#9b5968]"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-[#527765] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#527765]/15 transition hover:bg-[#456957] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-6 w-full text-center text-sm font-medium text-[#7a9186] transition hover:text-[#527765]"
            >
              ← Voltar para a página inicial
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}