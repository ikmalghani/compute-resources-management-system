import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17181c",
        muted: "#8b9098",
        line: "#e6e8ee",
        teal: {
          DEFAULT: "#00968a",
          dark: "#007f76",
        },
        sidebar: "#0f172b",
        canvas: "#c9cfd4",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04)",
        panel: "0 24px 60px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
