import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Vestara brand palette
        surface:  "#0d1117",
        card:     "#161b22",
        border:   "#21262d",
        muted:    "#8b949e",
        accent: {
          DEFAULT: "#3b82f6",
          hover:   "#2563eb",
        },
        positive: "#10b981",
        negative: "#ef4444",
        warning:  "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
