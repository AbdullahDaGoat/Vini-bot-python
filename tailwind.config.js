module.exports = {
  content: [
    './src/**/*.{html,js}',
    './public/**/*.{html,js}',
    './node_modules/tw-elements/dist/js/**/*.js'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#8B5CF6',
          600: '#7C3AED'
        },
        secondary: {
          500: '#3B82F6',
          600: '#2563EB'
        },
        purple: {
          500: '#8B5CF6',
          600: '#7C3AED'
        },
        blue: {
          500: '#3B82F6',
          600: '#2563EB'
        }
      }
    },
  },
  plugins: [],
}