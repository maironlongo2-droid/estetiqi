export default function IAPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <section className="rounded-2xl border border-[#e4ebe7] bg-white p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a7a84]">
          EstetiQI
        </p>

        <h2 className="mt-2 text-2xl font-semibold">
          Inteligência Artificial
        </h2>

        <p className="mt-2 max-w-2xl text-sm text-[#78867f]">
          Aqui ficará a inteligência do EstetiQI integrada aos clientes,
          procedimentos, agenda e automações.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[#e4ebe7] p-5">
            <h3 className="font-semibold">Clientes inativos</h3>
            <p className="mt-2 text-sm text-[#78867f]">
              Identificar clientes que precisam de reativação.
            </p>
          </div>

          <div className="rounded-xl border border-[#e4ebe7] p-5">
            <h3 className="font-semibold">Sugestões</h3>
            <p className="mt-2 text-sm text-[#78867f]">
              Encontrar oportunidades a partir dos dados do CRM.
            </p>
          </div>

          <div className="rounded-xl border border-[#e4ebe7] p-5">
            <h3 className="font-semibold">Mensagens</h3>
            <p className="mt-2 text-sm text-[#78867f]">
              Gerar mensagens personalizadas para clientes.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
