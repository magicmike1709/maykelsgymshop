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
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem'
      },
      boxShadow: {
        sm: '0 1px 2px rgba(28,35,23,0.04), 0 1px 1px rgba(28,35,23,0.03)',
        DEFAULT: '0 1px 2px rgba(28,35,23,0.04), 0 2px 6px rgba(28,35,23,0.05)',
        lg: '0 4px 10px rgba(28,35,23,0.06), 0 12px 28px -8px rgba(28,35,23,0.14)'
      },
      transitionTimingFunction: {
        ios: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
      }
    }
  },
  plugins: []
}
