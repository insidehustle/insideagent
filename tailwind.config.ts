import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 50: "#f7f6f3", 100: "#ecE9e2", 200: "#d8d3c6", 700: "#3a3630", 800: "#26231f", 900: "#1a1815" },
        accent: { DEFAULT: "#b4532a", dark: "#8f3f1e", soft: "#f6e3d9" },
      },
      fontFamily: { serif: ["Georgia", "Cambria", "serif"] },
    },
  },
  plugins: [],
};
export default config;
