/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./client/index.html",
    "./client/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        casino: {
          gold: '#FFD700',
          dark: '#1a1a2e',
          purple: '#4a0e4e',
          red: '#c62828'
        }
      }
    },
  },
  plugins: [],
}
