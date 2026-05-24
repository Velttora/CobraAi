import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cobrai: {
          bg: "#FAFAFA",
          dark: "#0A0806",
          accent: "#D85A30",
          positive: "#0F6E56",
          danger: "#A32D2D"
        }
      }
    }
  },
  plugins: []
};

export default config;
