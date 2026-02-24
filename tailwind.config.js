/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        bebas: ['"Bebas Neue"', 'sans-serif'],
      },
      colors: {
        gold:   '#C9A84C',
        silver: '#A8A9AD',
        dark:   '#0a0a0a',
      },
    },
  },
  plugins: [],
}
