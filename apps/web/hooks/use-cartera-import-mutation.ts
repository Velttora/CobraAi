import { useMutation } from "@tanstack/react-query";
import { postCarteraImport } from "../services/cartera/cartera-import.api";
import { useRenovaOrgStore } from "../stores/renova-org-store";

export function useCarteraImportMutation() {
  const orgId = useRenovaOrgStore((state) => state.orgId);
  const orgName = useRenovaOrgStore((state) => state.orgName);

  return useMutation({
    mutationKey: ["cartera", "import", orgId],
    mutationFn: (file: File) =>
      postCarteraImport(file, {
        orgId,
        orgName
      })
  });
}
