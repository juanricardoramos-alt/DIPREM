/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Paleta DIPREM (misma del sistema de diseño web: apps/web/app/globals.css)
        diprem: {
          DEFAULT: "#1d5b94",
          oscuro: "#14456f",
          navy: "#0f2b46",
        },
      },
    },
  },
  plugins: [],
};
