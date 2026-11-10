'use strict';
function colors(stream = process.stdout, env = process.env) {
  const enabled = Boolean(stream.isTTY) && !Object.hasOwn(env, 'NO_COLOR') && env.TERM !== 'dumb';
  const wrap = code => text => enabled ? `\x1b[${code}m${text}\x1b[0m` : String(text);
  return { green: wrap(32), red: wrap(31), yellow: wrap(33), cyan: wrap(36), dim: wrap(2), bold: wrap(1) };
}
function colorReport(text, stream = process.stdout) {
  const c = colors(stream);
  return text.split('\n').map(line => {
    if (/^  Package Security Assessment Report:/.test(line)) return c.bold(line);
    if (/^  ─/.test(line)) return c.dim(line);
    if (/\[TIER 2:/.test(line)) return c.cyan(line);
    if (/\[TIER 3:/.test(line)) return c.yellow(line);
    if (/: (Established|Trusted)$|^Installed successfully/.test(line)) return c.green(line);
    if (/: Blocked$|^Installation blocked/.test(line)) return c.red(line);
    if (/: Unverified$|^Installation cancelled/.test(line)) return c.yellow(line);
    if (/^(APPROVED|INSTALLED)/.test(line)) return c.green(line);
    if (/^(BLOCKED|Blocked)|^\s+BLOCK\b/.test(line)) return c.red(line);
    if (/^(DISALLOWED|Warnings:)|\bWARNING\b/.test(line)) return c.yellow(line);
    if (/^(Reviewed|Requested:)/.test(line)) return c.cyan(line);
    return line;
  }).join('\n');
}
module.exports = { colors, colorReport };
