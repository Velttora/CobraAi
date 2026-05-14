import { Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";

@Injectable()
export class ImportTemplateService {
  buildTemplate(): Buffer {
    const rows = [
      {
        Cliente: "Inversiones Delta",
        Documento: "901887766",
        Telefono: "3105550105",
        Email: "payments@delta.com",
        Vendedor: "Valentina Mejia",
        Factura: "FAC-2026-1001",
        Monto: 1250000,
        Moneda: "COP",
        "Fecha Emision": "2026-01-21",
        "Fecha Vencimiento": "2026-02-20",
        "Dias Credito": 30,
        Estado: "Vencida",
        "Dias Mora": 83,
        "Promesa Pago": "",
        "Canal Preferido": "WhatsApp",
        "Ultimo Contacto": "2026-05-13",
        Riesgo: "Alto"
      },
      {
        Cliente: "Cafe Premium Export",
        Documento: "811223344",
        Telefono: "3185550106",
        Email: "admin@cafepremium.co",
        Vendedor: "Carlos Ruiz",
        Factura: "FAC-2026-1003",
        Monto: 7800000,
        Moneda: "COP",
        "Fecha Emision": "2026-04-18",
        "Fecha Vencimiento": "2026-06-17",
        "Dias Credito": 60,
        Estado: "Proxima a vencer",
        "Dias Mora": 0,
        "Promesa Pago": "",
        "Canal Preferido": "Llamada",
        "Ultimo Contacto": "2026-05-10",
        Riesgo: "Bajo"
      }
    ];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "cartera");

    return XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer"
    }) as Buffer;
  }
}
