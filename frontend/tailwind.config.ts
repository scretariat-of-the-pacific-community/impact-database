import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        pacific: {
          50: '#e1f7ff',
          100: '#b7eaff',
          200: '#89dcff',
          300: '#5bcfff',
          400: '#2ec2ff',
          500: '#009ee0',
          600: '#007cb1',
          700: '#005d83',
          800: '#003d54',
          900: '#012334',
          950: '#001523',
        },
        coral: {
          50: '#ffece6',
          100: '#ffd2c3',
          200: '#ffb59d',
          300: '#ff9676',
          400: '#ff7c58',
          500: '#ff6b4a',
          600: '#f04f2c',
          700: '#c83a1d',
          800: '#9f2b15',
          900: '#701e0f',
        },
        palm: {
          50: '#e6f8f0',
          100: '#c5f0dc',
          200: '#94e3c1',
          300: '#5ed3a4',
          400: '#35c58c',
          500: '#18b374',
          600: '#0e935e',
          700: '#0c7249',
          800: '#09573a',
          900: '#063a27',
        },
        sand: {
          50: '#fffaf1',
          100: '#fef3e0',
          200: '#f9e4c2',
          300: '#f0ce9a',
          400: '#e6b471',
          500: '#d99a4b',
          600: '#b87738',
          700: '#915826',
          800: '#623815',
          900: '#3a210b',
        },
        deep: {
          50: '#edf4ff',
          100: '#d7e5fb',
          200: '#b3c8ef',
          300: '#8aa6dd',
          400: '#5974c6',
          500: '#374ea5',
          600: '#233382',
          700: '#16235f',
          800: '#0f1a46',
          900: '#091233',
          950: '#020917',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f4f6fb',
          soft: '#eef2ff',
          dark: '#0f172a',
        },
      },
      borderRadius: {
        xl: '1.25rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        card: '0px 15px 35px rgba(15, 23, 42, 0.08)',
        'card-hover': '0px 25px 45px rgba(15, 23, 42, 0.14)',
        focus: '0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4px #009ee0',
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'wave-sway': 'waveSway 6s ease-in-out infinite',
        float: 'float 5s ease-in-out infinite',
        ripple: 'ripple 0.8s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        waveSway: {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(-25px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        ripple: {
          '0%': {
            transform: 'scale(0)',
            opacity: '0.6',
          },
          '80%': {
            transform: 'scale(1.25)',
            opacity: '0',
          },
          '100%': {
            opacity: '0',
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
