import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    // hover-hover: 변형 — 진짜 hover가 가능한 기기(마우스)에서만 적용
    plugin(function ({ addVariant }) {
      addVariant('hover-hover', '@media (hover: hover)');
    }),
  ],
}
