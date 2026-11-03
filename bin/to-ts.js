// JavaScript backend files → TypeScript (kreft new --ts, and kreft make:* in a TypeScript project):
// require → import, module.exports → export default. Inline require('./X') stays (it works at run time).
function toTs(code) {
  return code
    .replace(/^const (\{[^}]+\}) = require\((['"][^'"]+['"])\);?[ \t]*$/gm, 'import $1 from $2')
    .replace(/^const (\w+) = require\((['"][^'"]+['"])\);?[ \t]*$/gm, 'import $1 from $2')
    .replace(/^require\((['"][^'"]+['"])\);?[ \t]*$/gm, 'import $1')
    // module.exports = { a, b } (a list of names) → export { a, b }, so `import { a } from` works
    .replace(/^module\.exports = (\{\s*[\w$]+(?:\s*,\s*[\w$]+)*\s*,?\s*\});?[ \t]*$/gm, 'export $1')
    .replace(/^module\.exports = /gm, 'export default ')
    // file names in the comments: routes/auth.js → routes/auth.ts
    .replace(/\b((?:routes|app|database|config)\/[\w/]+|\w+(?:Controller|Middleware|Seeder|Factory|Kernel))\.js\b/g, '$1.ts');
}

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    noImplicitAny: false, // the starter files leave parameters untyped; add types as you go
    noEmit: true,
    esModuleInterop: true,
    allowJs: true,
    skipLibCheck: true,
    types: ['node'],
    baseUrl: '.',
    paths: {
      'kreft': ['./frontend/kreft.d.ts'],
      'kreft/server': ['./backend/server.d.ts'],
    },
  },
  include: ['backend/**/*.ts', 'backend/**/*.d.ts', 'frontend/**/*.ts', 'frontend/**/*.d.ts'],
};

module.exports = { toTs, TSCONFIG };
