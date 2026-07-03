export type ImportColumnSpec = {
  label: string;
  internal: string;
  req: boolean;
  desc: string;
};

export const IMPORT_COLUMNS: ImportColumnSpec[] = [
  {
    label: "Referencia",
    internal: "external_ref",
    req: false,
    desc: "ID de tu sistema (factura, contrato…)"
  },
  {
    label: "Nombre",
    internal: "debtor_name",
    req: true,
    desc: "Nombre o razón social del deudor"
  },
  {
    label: "NIT / Cédula",
    internal: "debtor_tax_id",
    req: false,
    desc: "NIT o número de cédula"
  },
  {
    label: "Teléfono",
    internal: "debtor_phone",
    req: false,
    desc: "Número de contacto (ej. 3001234567)"
  },
  {
    label: "Correo",
    internal: "debtor_email",
    req: false,
    desc: "Correo electrónico del deudor"
  },
  {
    label: "Monto",
    internal: "amount",
    req: true,
    desc: "Valor sin separadores de miles (ej. 1500000)"
  },
  {
    label: "Moneda",
    internal: "currency",
    req: false,
    desc: "COP, USD, EUR… (COP por defecto)"
  },
  {
    label: "Vencimiento",
    internal: "due_date",
    req: true,
    desc: "Fecha de vencimiento YYYY-MM-DD"
  },
  {
    label: "Fecha Factura",
    internal: "invoice_date",
    req: false,
    desc: "Fecha de emisión YYYY-MM-DD"
  },
  {
    label: "Fecha Cobro",
    internal: "scheduled_collection_date",
    req: false,
    desc: "Fecha programada de gestión YYYY-MM-DD"
  },
  {
    label: "Plazo Días",
    internal: "payment_terms_days",
    req: false,
    desc: "Plazo pactado en días (ej. 30)"
  },
  {
    label: "Tipo",
    internal: "debtor_type",
    req: false,
    desc: "empresa o persona"
  },
  {
    label: "Ciudad",
    internal: "address_city",
    req: false,
    desc: "Ciudad del deudor"
  },
  {
    label: "País",
    internal: "address_country",
    req: false,
    desc: "Código de país (ej. CO)"
  },
  {
    label: "Descuento Pronto Pago (%)",
    internal: "discount_percentage",
    req: false,
    desc: "Porcentaje de descuento por pronto pago (ej. 5 o 0.05)"
  },
  {
    label: "Fecha Límite Pronto Pago",
    internal: "discount_expiration_date",
    req: false,
    desc: "Fecha límite del descuento por pronto pago YYYY-MM-DD"
  },
  {
    label: "metadata_*",
    internal: "metadata_*",
    req: false,
    desc: "Campos extra con prefijo metadata_ (ej. metadata_contrato)"
  }
];
