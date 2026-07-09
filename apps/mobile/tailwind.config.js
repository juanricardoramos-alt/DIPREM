/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Paleta corporativa provisoria (ajustar a manual de marca DIPREM)
        diprem: {
          DEFAULT: "#0f4c81",
          oscuro: "#0a3357",
        },
      },
    },
  },
  plugins: [],
};
