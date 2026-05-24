import type { Appearance } from "@clerk/types";
import type { CSSProperties } from "react";

export const cobraiClerkAppearance: Appearance = {
  variables: {
    colorPrimary: "#D85A30",
    colorBackground: "#130E09",
    colorText: "#F7F3EE",
    colorInputBackground: "#1A1208",
    colorInputText: "#F7F3EE",
    borderRadius: "8px"
  },
  elements: {
    card: { border: "0.5px solid rgba(255,255,255,0.1)" },
    formButtonPrimary: {
      backgroundColor: "#D85A30",
      "&:hover": { backgroundColor: "#E8724A" }
    }
  }
};

export const cobraiAuthShellStyle: CSSProperties = {
  display: "flex",
  minHeight: "100vh",
  alignItems: "center",
  justifyContent: "center",
  background: "#0A0806"
};
