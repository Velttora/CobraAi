export interface PricingPlan {
  id: string;
  name: string;
  price: string;
  period: string;
  target: string;
  features: string[];
  cta: string;
  href: string;
  highlighted: boolean;
  priceColor: "white" | "coral";
  priceSize: "normal" | "large";
}

export const PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$599",
    period: "/mes · facturado anual",
    target:
      "Fintechs, BNPL y pymes con cartera propia de hasta 1,000 cuentas",
    features: [
      "Hasta 1,000 deudas activas",
      "3 portafolios",
      "Email + SMS reales",
      "WA y Voz en stub",
      "Scoring IA incluido",
      "1 integración ERP",
      "Soporte por email"
    ],
    cta: "Comenzar gratis",
    href: "/login",
    highlighted: false,
    priceColor: "white",
    priceSize: "normal"
  },
  {
    id: "growth",
    name: "Growth",
    price: "$1,799",
    period: "/mes · facturado anual",
    target:
      "Retailers de crédito, agencias, cooperativas con 1K–10K cuentas",
    features: [
      "Hasta 10,000 deudas",
      "Portafolios ilimitados",
      "WhatsApp activo",
      "Voz IA activa",
      "Reglas y paquetes",
      "2 integraciones ERP",
      "Soporte prioritario"
    ],
    cta: "Empezar ahora",
    href: "/login",
    highlighted: true,
    priceColor: "coral",
    priceSize: "normal"
  },
  {
    id: "business",
    name: "Business",
    price: "$4,499",
    period: "/mes · facturado anual",
    target:
      "Bancos Tier 2, telcos y agencias de cobranza con 10K–100K cuentas",
    features: [
      "Hasta 100,000 deudas",
      "Multi-región",
      "Todos los canales",
      "ERPs ilimitados",
      "SLA 99.9%",
      "Dashboard ejecutivo",
      "Slack dedicado"
    ],
    cta: "Hablar con ventas",
    href: "/login",
    highlighted: false,
    priceColor: "coral",
    priceSize: "normal"
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "desde $10,000/mes",
    target:
      "Bancos Tier 1, financieras nacionales, carteras de más de 100K cuentas",
    features: [
      "Volumen ilimitado",
      "On-premise opcional",
      "SOC2 + GDPR",
      "SSO/SAML",
      "SLA contractual",
      "CSM dedicado",
      "Contrato anual"
    ],
    cta: "Contactar equipo",
    href: "/login",
    highlighted: false,
    priceColor: "white",
    priceSize: "large"
  }
];
