/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#155E75',
        },
      },
      fontFamily: {
        gmarket: ['GmarketSans', 'Pretendard Variable', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
