import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ops: {
          bg: "#070B12",
          panel: "#0B1220",
          panel2: "#111827",
          line: "#263244",
          text: "#E7EEF8",
          muted: "#8EA3B8",
          cyan: "#38BDF8",
          amber: "#F6B73C",
          red: "#EF4444",
          green: "#22C55E"
        }
      },
      boxShadow: {
        panel: "0 18px 45px rgba(0, 0, 0, 0.34)"
      }
    }
  },
  plugins: []
};

export default config;
