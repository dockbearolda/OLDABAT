/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        grotesk: ['Hanken Grotesk', 'sans-serif'],
      },
      colors: {
        background: '#0a0a0a',
        surface: '#171717',
        surfaceHover: '#262626',
        primary: '#3b82f6', // Bleu pro
        primaryHover: '#2563eb',
        textMain: '#f5f5f5',
        textMuted: '#a3a3a3',
        border: '#262626',
      }
    },
  },
  plugins: [],
}
