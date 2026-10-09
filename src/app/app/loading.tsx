// Loading global das rotas internas de /app.
// É exibido imediatamente pelo App Router enquanto a próxima página carrega,
// dando feedback visual durante a navegação. Leve, sem dependências e sem
// animações pesadas (usa apenas o utilitário nativo `animate-spin`).
export default function AppLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="app-main-min-h flex items-center justify-center bg-[#fbfaf8] text-[#26352f]"
    >
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="h-6 w-6 animate-spin rounded-full border-2 border-[#dfe9e3] border-t-[#527765]"
        />
        <span className="text-sm text-[#78867f]">Carregando...</span>
      </div>
    </main>
  );
}
