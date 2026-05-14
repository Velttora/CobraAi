import { apiClient, getApiOrigin } from "../api/axios-instance";
import { getApiErrorMessage } from "../api/http-error";
import { parseCarteraImportSummary, type CarteraImportSummary } from "./cartera-import.schema";

export type CarteraImportHeaders = {
  orgId: string;
  orgName: string;
};

export function getCarteraTemplateDownloadUrl(): string {
  return `${getApiOrigin()}/api/cartera/template.xlsx`;
}

export async function postCarteraImport(
  file: File,
  headers: CarteraImportHeaders
): Promise<CarteraImportSummary> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const { data } = await apiClient.post<unknown>("/cartera/import", formData, {
      headers: {
        "x-renova-org-id": headers.orgId,
        "x-renova-org-name": headers.orgName
      }
    });

    return parseCarteraImportSummary(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, "No se pudo importar el archivo."), {
      cause: error
    });
  }
}
