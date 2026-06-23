/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0B0F1A',
          800: '#151D30',
          700: '#1F2B48',
        },
      },
    },
  },
  plugins: [],
}
