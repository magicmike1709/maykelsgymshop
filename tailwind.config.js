/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f6f4e9',
        surface: '#ffffff',
        sunken: '#eef0e1',
        ink: '#1c2317',
        muted: '#5b6353',
        line: '#dde0cd',
        green: { DEFAULT: '#2f7d32', strong: '#1e5522', soft: '#e3f0e0' },
        yellow: { DEFAULT: '#d9a418', soft: '#faf0d0' },
        blue: { DEFAULT: '#2f6d9e', soft: '#e2edf5' },
        red: { DEFAULT: '#b8453c', soft: '#f7e4e1' }
      },
      fontFamily: {
        display: ['Oswald', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
