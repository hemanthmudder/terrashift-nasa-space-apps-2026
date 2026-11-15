import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        terra: {
          50: "#f2f8f4",
          100: "#e1efe6",
          200: "#c4e0ce",
          500: "#2e6f40",
          600: "#225732",
          700: "#1b4528",
          800: "#14331d",
          900: "#0d2113",
        },
        earth: {
          50: "#faf8f5",
          100: "#f3efe6",
          200: "#e6decb",
          600: "#8c6d46",
          800: "#544028",
        },
        orbital: {
          50: "#f0f7ff",
          100: "#e0effe",
          500: "#1d70b8",
          600: "#15548a",
          700: "#0f3c63",
        },
      },
    },
  },
  plugins: [],
};

export default config;
