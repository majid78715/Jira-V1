import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./ui-library/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4fef0",
          100: "#e0fce5",
          200: "#c8f9d6",
          300: "#9ef3c0",
          400: "#57CABE",
          500: "#3bb8a8",
          600: "#00879F",
          700: "#006d85",
          800: "#005568",
          900: "#004555",
          DEFAULT: "#57CABE"
        },
        accent: {
          lime: "#D0F94A",
          turquoise: "#57CABE",
          teal: "#00879F"
        },
        ink: {
          50: "#f7f7f7",
          100: "#ebedef",
          200: "#d9dde3",
          300: "#c5cad0",
          400: "#9ba5b4",
          500: "#7a8699",
          600: "#4b5565",
          700: "#344054",
          800: "#1d2531",
          900: "#101828"
        }
      },
      boxShadow: {
        card: "0 4px 24px rgba(16, 24, 40, 0.08)"
      },
      borderRadius: {
        xl: "1.25rem"
      },
      fontSize: {
        xs: ["var(--font-size-xs)", { lineHeight: "var(--line-height-tight)" }],
        sm: ["var(--font-size-sm)", { lineHeight: "var(--line-height-snug)" }],
        base: ["var(--font-size-base)", { lineHeight: "var(--line-height-relaxed)" }],
        lg: ["var(--font-size-lg)", { lineHeight: "var(--line-height-relaxed)" }]
      }
    }
  },
  plugins: []
};

export default config;
