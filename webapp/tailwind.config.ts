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
        // Platstock brand palette — Platstock Dark
        surface:  "#0A0A0F",
        card:     "#111118",
        border:   "#1A1A28",
        muted:    "#6B7280",
        accent: {
          DEFAULT: "#8B5CF6",
          hover:   "#7C3AED",
        },
        positive: "#10B981",
        negative: "#EF4444",
        warning:  "#F59E0B",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      keyframes: {
        "flash-green": {
          "0%":   { backgroundColor: "rgba(16,185,129,0.25)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-red": {
          "0%":   { backgroundColor: "rgba(239,68,68,0.25)" },
          "100%": { backgroundColor: "transparent" },
        },
        ticker: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "slide-in-right": {
          "0%":   { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)",    opacity: "1" },
        },
        "fade-in": {
          "0%":   { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "flash-green":     "flash-green 0.6s ease-out",
        "flash-red":       "flash-red 0.6s ease-out",
        "ticker":          "ticker 40s linear infinite",
        "slide-in-right":  "slide-in-right 0.25s ease-out",
        "fade-in":         "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
