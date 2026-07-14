/** @type {import("@ianvs/prettier-plugin-sort-imports").PrettierConfig} */
const config = {
  printWidth: 100,
  singleQuote: false,
  jsxSingleQuote: false,
  semi: true,
  tabWidth: 2,
  trailingComma: "es5",
  endOfLine: "crlf",
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  importOrder: [
    "^react$",
    "<BUILTIN_MODULES>",
    "<THIRD_PARTY_MODULES>",
    // "^@mui/(.*)$",
    "^@docs/(.*)$",
    "",
    "^./.*$",
    "^../(?!.*.css$).*$",
    "^./(?!.*.css$).*$",
    "\\.css$",
    "\\.svg$",
  ],
};

export default config;
