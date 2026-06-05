const DELAYS = ["l-delay-1", "l-delay-2", "l-delay-3", "l-delay-4"] as const;
const ROI_DELAYS = ["l-delay-2", "l-delay-3", "l-delay-4"] as const;

const BIG_METRICS = [
  { value: "38%", label: "Recuperación adicional promedio" },
  { value: "−62%", label: "Reducción de DSO" },
  { value: "4.2×", label: "Productividad por agente" },
  { value: "98%", label: "Cumplimiento de horarios" }
];

const ROI_CASES = [
  {
    title: "Fintech PyME — 12.000 cuentas",
    uplift: "+41% recuperación en 90 días",
    detail: "Paquete pyme_fintech + WhatsApp prioritario"
  },
  {
    title: "B2B industrial — COP 2.8B cartera",
    uplift: "−58% días en cartera vencida",
    detail: "Paquete empresa_grande + voz IA en aging 60+"
  },
  {
    title: "Crédito consumo — 45.000 deudores",
    uplift: "+33% promesas cumplidas",
    detail: "Paquete cartera_personas + WhatsApp + escalamiento"
  }
];

export function MetricsSection(): React.ReactElement {
  return (
    <section className="l-section l-container" id="metrics">
      <div className="l-reveal text-center">
        <p className="l-eyebrow">Resultados</p>
        <h2 className="l-display mt-3 text-4xl md:text-5xl">
          Números que
          <em className="l-accent text-[#D85A30]"> hablan solos</em>
        </h2>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BIG_METRICS.map((metric, index) => (
          <article
            className={`l-card l-reveal ${DELAYS[index] ?? "l-delay-1"} text-center`}
            key={metric.label}
          >
            <p className="l-display text-5xl text-[#D85A30]">{metric.value}</p>
            <p className="mt-2 text-sm text-[#9a9088]">{metric.label}</p>
          </article>
        ))}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {ROI_CASES.map((item, index) => (
          <article
            className={`l-card l-reveal ${ROI_DELAYS[index] ?? "l-delay-2"}`}
            key={item.title}
          >
            <p className="text-xs uppercase tracking-wide text-[#EF9F27]">
              Caso ROI
            </p>
            <h3 className="mt-2 font-semibold">{item.title}</h3>
            <p className="l-display mt-3 text-2xl text-[#1D9E75]">
              {item.uplift}
            </p>
            <p className="mt-2 text-sm text-[#9a9088]">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
