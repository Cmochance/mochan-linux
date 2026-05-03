/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Ink OS palette
        ink: {
          50: '#f0ebe4',
          100: '#e8e4df',
          200: '#d9d9d9',
          300: '#bdbdbd',
          400: '#9e9e9e',
          500: '#7a7a7a',
          600: '#5c5c5c',
          700: '#3d3d3d',
          800: '#2d2d2d',
          900: '#1a1a1a',
        },
        cinnabar: {
          DEFAULT: '#b3392f',
          light: '#c94a3f',
          dark: '#8a2a22',
        },
        'seal-red': '#a62e26',
        'glass-bg': 'rgba(240, 235, 228, 0.75)',
        'glass-border': 'rgba(158, 158, 158, 0.25)',
        'glass-active': 'rgba(240, 235, 228, 0.92)',
        success: '#4a7c59',
        warning: '#b8860b',
        error: '#b3392f',
        info: '#5a7a8a',
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      fontFamily: {
        display: ['"ZCOOL XiaoWei"', 'cursive', 'serif'],
        heading: ['"Noto Serif SC"', 'Georgia', 'serif'],
        body: ['"Noto Sans SC"', 'system-ui', 'sans-serif'],
        code: ['"Maple Mono CN"', '"Courier New"', 'monospace'],
        handwritten: ['"Ma Shan Zheng"', 'cursive'],
        'english-display': ['"Playfair Display"', 'Georgia', 'serif'],
        'english-body': ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        sm: '0 1px 3px rgba(26,26,26,0.06)',
        md: '0 4px 12px rgba(26,26,26,0.08)',
        lg: '0 8px 24px rgba(26,26,26,0.10)',
        xl: '0 12px 40px rgba(26,26,26,0.14)',
        focus: '0 0 0 3px rgba(179,57,47,0.15)',
        dock: '0 -4px 20px rgba(26,26,26,0.06)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "bounce-dock": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "bounce-dock": "bounce-dock 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      zIndex: {
        window: '100',
        'window-active': '500',
        modal: '1000',
        'context-menu': '1100',
        tooltip: '1200',
        'system-bar': '2000',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
