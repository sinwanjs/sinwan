/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{tsx,ts,jsx,js}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      colors: {
        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        bg: "var(--bg)",
        "bg-top": "var(--bg-top)",
        "bg-sidebar": "var(--bg-sidebar)",
        panel: "var(--panel)",
        "panel-strong": "var(--panel-strong)",
        text: "var(--text)",
        "text-muted": "var(--text-muted)",
        border: "var(--border)",
        "code-bg": "var(--code-bg)",
        glass: "var(--glass)",
      },
      boxShadow: {
        app: "var(--shadow)",
      },
    },
  },
  plugins: [],
};
