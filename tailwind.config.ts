import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"]
      },
      colors: {
        // Surface hierarchy
        surface: {
          base: "#F8F9FB",
          card: "#FFFFFF",
          subtle: "#F3F4F6",
          inset: "#ECEEF1"
        },
        // Border
        border: {
          base: "#E5E7EB",
          strong: "#D1D5DB"
        },
        // Ink (text)
        ink: {
          primary: "#0F172A",
          secondary: "#374151",
          muted: "#6B7280",
          ghost: "#9CA3AF"
        },
        // Primary accent
        accent: {
          DEFAULT: "#2563EB",
          bg: "#EFF6FF",
          hover: "#1D4ED8"
        },
        // Risk — semantic only
        risk: {
          critical: "#DC2626",
          "critical-bg": "#FEF2F2",
          "critical-border": "#FECACA",
          high: "#D97706",
          "high-bg": "#FFFBEB",
          "high-border": "#FDE68A",
          medium: "#CA8A04",
          "medium-bg": "#FEFCE8",
          "medium-border": "#FEF08A",
          low: "#16A34A",
          "low-bg": "#F0FDF4",
          "low-border": "#BBF7D0"
        },
        // Chart data colors
        data: {
          blue: "#3B82F6",
          indigo: "#6366F1",
          amber: "#F59E0B",
          red: "#EF4444",
          green: "#22C55E",
          slate: "#94A3B8"
        },
        // Keep legacy ops tokens so any untouched code doesn't break
        ops: {
          bg: "#F8F9FB",
          panel: "#FFFFFF",
          panel2: "#F3F4F6",
          line: "#E5E7EB",
          text: "#0F172A",
          muted: "#6B7280",
          cyan: "#2563EB",
          amber: "#D97706",
          red: "#DC2626",
          green: "#16A34A"
        }
      },
      boxShadow: {
        // Three-level shadow system for light theme depth
        card: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        raised: "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
        overlay: "0 20px 40px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06)",
        // Legacy alias
        panel: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
        "3xl": "20px"
      }
    }
  },
  plugins: []
};

export default config;
