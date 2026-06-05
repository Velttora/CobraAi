const PACKAGES = [
  {
    id: "empresa_grande",
    name: "Empresa grande",
    rules: 8,
    uplift: "+35% recuperación B2B",
    channels: ["email", "whatsapp", "voice (stub)"],
    description: "Formal, escalonado, con voz IA en aging 60+ y escalamiento humano."
  },
  {
    id: "pyme_fintech",
    name: "PyME / Fintech",
    rules: 7,
    uplift: "+41% en 90 días",
    channels: ["whatsapp", "email"],
    description: "Digital-first: WhatsApp prioritario en todo el ciclo de aging."
  },
  {
    id: "cartera_personas",
    name: "Cartera personas",
    rules: 8,
    uplift: "+33% promesas cumplidas",
    channels: ["whatsapp", "voice (stub)"],
    description: "Alto volumen consumo: contacto frecuente y escalamiento legal."
  }
];

const PKG_DELAYS = ["l-delay-1", "l-delay-2", "l-delay-3"] as const;

export function PackagesSection(): React.ReactElement {
  return (
    <section className="l-section l-container" id="packages">
      <div className="l-reveal mx-auto max-w-2xl text-center">
        <p className="l-eyebrow">Paquetes de inicio</p>
        <h2 className="l-display mt-3 text-4xl md:text-5xl">
          Estrategias probadas,
          <em className="l-accent text-[#D85A30]"> listas para aplicar</em>
        </h2>
        <p className="mt-4 text-sm text-[#9a9088] md:text-base">
          Cada paquete crea reglas reales editables en tu tenant. Modifica, agrega
          o elimina con total libertad después de aplicar.
        </p>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {PACKAGES.map((pkg, index) => (
          <article
            className={`l-card l-reveal ${PKG_DELAYS[index] ?? "l-delay-1"} flex flex-col`}
            key={pkg.id}
          >
            <h3 className="l-display text-2xl">{pkg.name}</h3>
            <p className="mt-2 text-sm text-[#9a9088]">{pkg.description}</p>
            <p className="l-display mt-4 text-xl text-[#1D9E75]">{pkg.uplift}</p>
            <p className="mt-3 text-xs text-[#9a9088]">{pkg.rules} reglas incluidas</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {pkg.channels.map((channel) => (
                <span
                  className="rounded-full bg-[#14100c] px-2 py-0.5 text-xs capitalize text-[#9a9088] ring-1 ring-white/10"
                  key={channel}
                >
                  {channel}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
