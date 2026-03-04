/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "./src/**/*.{js,jsx}", "./src/**/*.mdx"],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#A2D8F9",
          text: "#0D4C7C",
        },
      },
      fontFamily: {
        display: ["'Gotham Rounded'", "'Avenir Next'", "Avenir", "Nunito", "sans-serif"],
        body: ["'Gotham Rounded'", "'Avenir Next'", "Avenir", "Nunito", "sans-serif"],
      },
    },
  },
  plugins: [],
};
