// .cjs because package.json has "type": "module": a CommonJS config in a
// plain .js file fails with "module is not defined in ES module scope".
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
