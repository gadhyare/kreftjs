'use strict';
/*
 * How the progress of `kreft install` is shown. The installer sends one message per package it checks (109 for a mobile app).
 * On a terminal those become ONE line that updates in place, with a bar, and a one-line summary at the end.
 * Without a terminal (CI, a pipe) only a few lines are printed, so a log stays short.
 * --verbose shows every message, as the installer sends them.
 */
const { colors } = require('./colors.js');
const META = /^Checked registry metadata \[(\d+)\/(\d+)\]: (.*)$/;
const REVIEW = /^Reviewing (\d+) unique package versions/;

function makeProgress({ out = process.stderr, verbose = false, plain = false, color = false } = {}) {
  const live = Boolean(out.isTTY) && !verbose && !plain;
  const c = colors(color && !plain ? out : { isTTY: false });
  const say = text => {
    const paint = /blocked|failed|error/i.test(text) ? c.red
      : /unavailable|warning/i.test(text) ? c.yellow
        : /passed|successfully|✓/.test(text) ? c.green : c.cyan;
    out.write(paint(text) + '\n');
  };
  let open = false;       // a live line is on screen
  let unavailable = 0;
  let total = 0;

  const closeLine = () => { if (open) { out.write('\r\x1b[2K'); open = false; } };

  return function progress(message) {
    const text = String(message);
    if (verbose) return say(text);

    const review = REVIEW.exec(text);
    if (review) { total = Number(review[1]); unavailable = 0; return say(`Checking ${total} package version${total === 1 ? '' : 's'} against the npm registry...`); }

    const m = META.exec(text);
    if (m) {
      const n = Number(m[1]), of = Number(m[2]);
      if (/\(unavailable;/.test(m[3])) unavailable++;
      const name = m[3].replace(/ \(unavailable;.*$/, '');
      if (live) {
        const width = Math.max(20, Math.min(out.columns || 80, 120));
        const filled = Math.round((n / of) * 20);
        const head = `  [${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${n}/${of}  `;
        out.write('\r\x1b[2K' + head + (name.length > width - head.length - 1 ? name.slice(0, Math.max(0, width - head.length - 2)) + '…' : name));
        open = true;
      } else if (n === 1 || n === of || n % 25 === 0) say(`  checked ${n}/${of}`);
      if (n === of) {
        closeLine();
        say(`  ✓ Checked ${of} package version${of === 1 ? '' : 's'} in the registry${unavailable ? ` (${unavailable} unavailable: the policy treats missing evidence as a finding)` : ''}.`);
      }
      return;
    }
    closeLine();
    say(text);
  };
}

module.exports = { makeProgress };
