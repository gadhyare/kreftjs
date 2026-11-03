/*
 * Folder guard: Kreft notices when the folder it works in is deleted, moved or put in the Trash.
 *
 * A running process keeps working on a folder that was moved away (the files are still there, under a new
 * name), so `kreftjs dev` would carry on serving a project you thought was gone, and a terminal opened in the
 * old folder would run commands against the Trash. The operating system cannot be asked to refuse the
 * delete, so Kreft says it loudly instead:
 *   - every command first checks that the folder it runs in is not deleted or in the Trash;
 *   - `kreftjs dev`, `kreftjs serve` and the queue / schedule workers check every second and stop with a message.
 */
const fs = require('fs');
const path = require('path');
const t = require('./terminal.js');

// the Trash / Recycle Bin on macOS, Linux and Windows
const TRASH = /(^|[\\/])(\.Trash|\.Trashes|\$Recycle\.Bin|RECYCLER)([\\/]|$)|[\\/]\.local[\\/]share[\\/]Trash[\\/]/i;
const inTrash = (p) => TRASH.test(String(p || ''));

// where this process is, or null when that folder no longer exists (Linux: getcwd fails)
function here() {
  try { return process.cwd(); } catch (_) { return null; }
}

// why `dir` can't be used any more: 'deleted', 'trash', or null when it is fine
function problem(dir) {
  if (!dir) return 'deleted';
  let real;
  try { real = fs.realpathSync(dir); } catch (_) { return 'deleted'; }
  if (inTrash(real)) return 'trash';
  return null;
}

function explain(kind, dir) {
  const what = kind === 'trash' ? 'was moved to the Trash' : 'was deleted or moved away';
  return [
    '',
    `  ${t.red('✖')} ${t.bold('The project folder ' + what + ':')}`,
    `      ${dir || '(unknown)'}`,
    '',
    `  Kreft cannot read or write its files any more, so it stops here instead of carrying on`,
    `  with a copy of the project that you may think is gone.`,
    `  ${t.dim('Restore the folder (or open a terminal in the right one), then start it again.')}`,
    '',
  ].join('\n');
}

// before a command runs: refuse to work inside a deleted folder or in the Trash
function checkStart(command) {
  if (['help', '--help', '-h', '--version', '-v'].includes(command)) return;
  const cwd = here();
  const kind = problem(cwd);
  if (!kind) return;
  console.error(explain(kind, cwd || process.env.PWD));
  process.exit(1);
}

// while a long command runs: look at the folders it depends on every second. A rebuild can empty a folder
// for a moment, so a folder must be gone on three checks in a row before we stop.
function watch(dirs, { onStop, every = 1000 } = {}) {
  const list = [...new Set(dirs.filter(Boolean).map((d) => path.resolve(d)))];
  const misses = new Map();
  const timer = setInterval(() => {
    for (const dir of list) {
      const kind = problem(dir);
      if (!kind) { misses.delete(dir); continue; }
      const n = (misses.get(dir) || 0) + 1;
      misses.set(dir, n);
      if (kind === 'trash' || n >= 3) {
        clearInterval(timer);
        console.error(explain(kind, dir));
        try { if (onStop) onStop(); } catch (_) { /* we are leaving anyway */ }
        process.exit(1);
      }
    }
  }, every);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { checkStart, watch, problem, inTrash, explain };
