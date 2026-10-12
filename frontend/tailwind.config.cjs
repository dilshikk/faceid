// .cjs because package.json has "type": "module" (see postcss.config.cjs).
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
