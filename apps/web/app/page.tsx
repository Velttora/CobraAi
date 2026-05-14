const capabilities = [
  "Cartera",
  "Clientes",
  "Facturas",
  "Conversaciones",
  "Campanas",
  "Voz",
  "Organizaciones"
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Renova Fase 1
      </p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950">
        MVP de cobranza con arquitectura por capacidades de negocio.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Monorepo Turbo con Next.js, NestJS, Prisma, Clerk, WhatsApp y llamadas
        de voz con IA. Sin Redis ni capa dedicada de cache en el MVP.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {capabilities.map((capability) => (
          <span
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm"
            key={capability}
          >
            {capability}
          </span>
        ))}
      </div>
    </main>
  );
}
