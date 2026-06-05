const CHANNELS = [
  { name: "WhatsApp", detail: "Mensajes con opt-in y plantillas aprobadas" },
  { name: "Email", detail: "Secuencias formales para B2B y recordatorios" },
  { name: "Voz IA (stub)", detail: "Llamadas automatizadas — listas cuando el servicio esté activo" }
];

const CHANNEL_STATS = [
  { value: "3", label: "Canales integrados" },
  { value: "98%", label: "Cumplimiento horario" },
  { value: "3×", label: "Tasa de respuesta vs. email solo" },
  { value: "0", label: "Integraciones duplicadas" }
];

export function ChannelsSection(): React.ReactElement {
  return (
    <section className="l-section l-container" id="channels">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div className="l-reveal">
          <p className="l-eyebrow">Omnicanal</p>
          <h2 className="l-display mt-3 text-4xl md:text-5xl">
            Un motor,
            <em className="l-accent text-[#1D9E75]"> todos los canales</em>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[#9a9088] md:text-base">
            CobraAI enruta cada contacto al canal óptimo según score, consentimiento
            y regla de workflow. La voz IA ya está en los paquetes — se activará
            automáticamente cuando el servicio esté listo.
          </p>
          <ul className="mt-6 space-y-3">
            {CHANNELS.map((channel, index) => (
              <li
                className={`l-reveal ${["l-delay-1", "l-delay-2", "l-delay-3", "l-delay-4"][index] ?? "l-delay-1"} border-l-2 border-[#D85A30] pl-4`}
                key={channel.name}
              >
                <p className="font-semibold">{channel.name}</p>
                <p className="text-sm text-[#9a9088]">{channel.detail}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CHANNEL_STATS.map((stat, index) => (
            <article
              className={`l-card l-reveal ${["l-delay-2", "l-delay-3", "l-delay-4", "l-delay-5"][index] ?? "l-delay-2"} text-center`}
              key={stat.label}
            >
              <p className="l-display text-4xl text-[#D85A30]">{stat.value}</p>
              <p className="mt-1 text-xs text-[#9a9088]">{stat.label}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
