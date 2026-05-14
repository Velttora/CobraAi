import { create } from "zustand";

type RenovaOrgState = {
  orgId: string;
  orgName: string;
  setOrg: (orgId: string, orgName: string) => void;
};

const defaultOrgId = process.env.NEXT_PUBLIC_RENOVA_ORG_ID ?? "dev_org";
const defaultOrgName =
  process.env.NEXT_PUBLIC_RENOVA_ORG_NAME ?? "Renova Dev Organization";

export const useRenovaOrgStore = create<RenovaOrgState>((set) => ({
  orgId: defaultOrgId,
  orgName: defaultOrgName,
  setOrg: (orgId, orgName) => set({ orgId, orgName })
}));
