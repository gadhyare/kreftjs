/*
 * Starting npm and other .cmd programs on Windows.
 *
 * Since Node.js 20.12 (and 22) a .cmd or .bat file can only be started through a shell: spawn('npm.cmd') alone fails with
 * "spawnSync npm.cmd EINVAL". These helpers do that on Windows and start the program directly everywhere else.
 * With a shell, an argument could carry a second command (`pkg & calc`), so characters that mean something to cmd.exe are refused.
 */
const { spawn, spawnSync } = require('child_process');

const WIN = () => process.platform === 'win32';
const UNSAFE = /[;&|`$<>%!"\r\n]/;
const quote = (a) => (/[\s^()]/.test(a) ? `"${a}"` : a);
const isCmdFile = (f) => /\.(cmd|bat)$/i.test(f);

function prepare(cmd, args, options) {
  if (!WIN() || !isCmdFile(cmd) && cmd !== 'npm' && cmd !== 'npx') return { cmd, args, options };
  const list = args.map(String);
  const bad = list.find((a) => UNSAFE.test(a));
  if (bad) throw new Error(`The argument ${JSON.stringify(bad)} has a character that is not allowed here.`);
  return { cmd: quote(cmd), args: list.map(quote), options: { ...options, shell: true } };
}

// spawnSync that works for npm on Windows; an unsafe argument comes back as { status: 1, error }
function runSync(cmd, args = [], options = {}) {
  try {
    const p = prepare(cmd, args, options);
    return spawnSync(p.cmd, p.args, p.options);
  } catch (error) {
    return { status: 1, error };
  }
}

// spawn that works for .cmd programs (electron-builder.cmd …) on Windows
function start(cmd, args = [], options = {}) {
  const p = prepare(cmd, args, options);
  return spawn(p.cmd, p.args, p.options);
}

module.exports = { runSync, start, isCmdFile, prepare };
