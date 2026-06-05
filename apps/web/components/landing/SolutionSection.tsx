const DELAYS = [
  "l-delay-1",
  "l-delay-2",
  "l-delay-3",
  "l-delay-4",
  "l-delay-5",
  "l-delay-1"
] as const;

const FEATURES = [
  {
    title: "Score IA por deuda",
    body: "Prioriza automáticamente quién contactar primero según riesgo y perfil."
  },
  {
    title: "Workflows sin código",
    body: "Reglas por trigger, canal y condición — editables desde el día uno."
  },
  {
    title: "Paquetes pre-configurados",
    body: "Empresa grande, PyME fintech o cartera personas: empieza en minutos."
  },
  {
    title: "Omnicanal nativo",
    body: "WhatsApp, email y voz IA en un solo motor de ejecución."
  },
  {
    title: "Pipeline por trimestre",
    body: "Gestiona cobro diferido: future, upcoming y activas en una vista."
  },
  {
    title: "Auditoría completa",
    body: "Cada contacto, pago y escalamiento queda registrado por tenant."
  }
];

export function SolutionSection(): React.ReactElement {
  return (
    <section className="l-section l-container" id="solution">
      <div className="mx-auto max-w-2xl text-center">
        <p className="l-eyebrow l-reveal">La solución</p>
        <h2 className="l-display l-reveal l-delay-1 mt-3 text-4xl md:text-5xl">
          Un sistema de cobranza
          <em className="l-accent text-[#1D9E75]"> que piensa contigo</em>
        </h2>
        <p className="l-reveal l-delay-2 mt-4 text-sm text-[#9a9088] md:text-base">
          CobraAI conecta cartera, automatización y compliance en una plataforma
          diseñada para equipos de recuperación en Colombia, México y más.
        </p>
      </div>
      <div className="l-grid-6 mt-10">
        {FEATURES.map((item, index) => (
          <article
            className={`l-card l-reveal ${DELAYS[index] ?? "l-delay-1"}`}
            key={item.title}
          >
            <h3 className="font-semibold text-[#f5f0ea]">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#9a9088]">
              {item.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
