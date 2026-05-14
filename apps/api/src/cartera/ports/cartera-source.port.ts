import type { ParsedCarteraImport } from "../models/cartera-import.models";

export const CARTERA_SOURCE = Symbol("CARTERA_SOURCE");

export interface CarteraSource {
  parse(file: Express.Multer.File): ParsedCarteraImport;
}
