/** @type {import('tailwindcss').Config} */
module.exports = {

    content: [
      "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
      "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
      "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    
    theme: {
      extend: {
        fontFamily: {
          'figtree': ['var(--font-figtree)'],
          'funnel': ['var(--font-funnel-display)'],
          'outfit': ['var(--font-outfit)'],
          'tinos': ['var(--font-tinos)'],
        },
        colors: {
          background: 'rgb(var(--background) / <alpha-value>)',
          surface: 'rgb(var(--surface) / <alpha-value>)',
          border: 'rgb(var(--border) / <alpha-value>)',
          foreground: {
            DEFAULT: 'rgb(var(--foreground) / <alpha-value>)',
            secondary: 'rgb(var(--foreground-secondary) / <alpha-value>)',
          },
          primary: {
            DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
            hover: 'rgb(var(--primary-hover) / <alpha-value>)',
          },
          accent: 'rgb(var(--accent) / <alpha-value>)',
          success: 'rgb(var(--success) / <alpha-value>)',
          danger: 'rgb(var(--danger) / <alpha-value>)',
        },
      },
    },
    plugins: [],
  };