// Builds this app with the Kreft CLI of this repository, then puts the runtime next to it, minified like a production build.
// Env: KREFT_CLI (default: bin/kreftjs.js of this repo), KREFT_RUNTIME (a kreftjs.js to measure; default: this repo's),
//      ESBUILD_DIR (a folder that has node_modules/esbuild; default: this repo or the current folder)
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path')
const REPO = path.resolve(__dirname, '..', '..', '..')
const CLI = process.env.KREFT_CLI || path.join(REPO, 'bin', 'kreftjs.js')
fs.rmSync('dist', { recursive: true, force: true })
execFileSync('node', [CLI, 'build', 'src', '--out', 'dist', '--base', './', '--no-minify'], { stdio: 'inherit' })
const runtime = process.env.KREFT_RUNTIME || path.join(path.dirname(CLI), '..', 'kreftjs.js')
const esbuild = require(require.resolve('esbuild', { paths: [process.env.ESBUILD_DIR || process.cwd(), REPO, process.cwd()] }))
fs.writeFileSync('dist/kreftjs.js', esbuild.transformSync(fs.readFileSync(runtime, 'utf8'), { minify: true, target: 'es2020', legalComments: 'none' }).code)
console.log('runtime:', runtime, fs.statSync('dist/kreftjs.js').size, 'bytes')
