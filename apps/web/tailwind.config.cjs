/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui"]
      },
      colors: {
        ink: "#0f172a",
        mist: "#f8fafc",
        peach: "#ffb37c",
        blush: "#ffe7d1",
        sea: "#e0f2fe"
      },
      boxShadow: {
        soft: "0 20px 50px rgba(15, 23, 42, 0.12)",
        card: "0 18px 40px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
