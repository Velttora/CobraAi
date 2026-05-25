import Link from "next/link";
import { LOGIN_ROUTE } from "../../lib/routes";
import { PLANS, type PricingPlan } from "./pricing-data";

const CARD_DELAYS = ["l-delay-1", "l-delay-2", "l-delay-3", "l-delay-4"] as const;

export function PricingSection(): React.ReactElement {
  return (
    <section className="l-section l-container" id="pricing">
      <div className="l-reveal pricing-header">
        <div className="l-tag">Precios</div>
        <h2 className="pricing-title l-display">
          Elige el plan <em className="l-accent">para tu operación.</em>
        </h2>
        <p className="pricing-subtitle">
          Empieza con el plan que se ajusta a tu cartera hoy. Sube de plan cuando
          tu operación lo necesite.
        </p>
      </div>

      <div className="pricing-grid">
        {PLANS.map((plan, index) => (
          <PricingCard
            delay={CARD_DELAYS[index] ?? "l-delay-1"}
            key={plan.id}
            plan={plan}
          />
        ))}
      </div>

      <p className="pricing-note l-reveal l-delay-4">
        Todos los planes incluyen 14 días de prueba sin compromiso. Sin tarjeta de
        crédito. Soporte en español y portugués.
      </p>
    </section>
  );
}

function PricingCard({
  plan,
  delay
}: {
  plan: PricingPlan;
  delay: string;
}): React.ReactElement {
  const priceClass = [
    "pricing-price",
    plan.priceColor === "coral" ? "pricing-price--coral" : "pricing-price--white",
    plan.priceSize === "large" ? "pricing-price--large" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const cardClass = [
    "pricing-card",
    "l-reveal",
    delay,
    plan.highlighted ? "pricing-card--highlighted" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const ctaClass = plan.highlighted
    ? "pricing-cta pricing-cta--primary"
    : "pricing-cta pricing-cta--ghost";

  return (
    <article className={cardClass}>
      {plan.highlighted ? <div className="pricing-badge">Popular</div> : null}

      <div className="pricing-plan-name">{plan.name}</div>

      <div className="pricing-price-block">
        <div className={priceClass}>{plan.price}</div>
        <div className="pricing-period">{plan.period}</div>
      </div>

      <p className="pricing-target">{plan.target}</p>

      <div className="pricing-divider" />

      <ul className="pricing-features">
        {plan.features.map((feature) => (
          <li className="pricing-feature" key={feature}>
            <span aria-hidden className="pricing-feature-dot" />
            {feature}
          </li>
        ))}
      </ul>

      <Link className={ctaClass} href={LOGIN_ROUTE}>
        {plan.cta} →
      </Link>
    </article>
  );
}
