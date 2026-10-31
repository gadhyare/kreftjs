/*
 * Custom console commands (app/Console/Commands, som make:command SendReport).
 *
 *   class SendReport extends Command {
 *     static signature = 'send:report {user} {--queue}'
 *     static description = 'Email the report'
 *     async handle() { this.info('Sent to ' + this.argument('user')) }
 *   }
 */
const tty = () => process.stdout.isTTY;
const green = (s) => (tty() ? `\x1b[32m${s}\x1b[0m` : s);
const dim = (s) => (tty() ? `\x1b[2m${s}\x1b[0m` : s);
const yellow = (s) => (tty() ? `\x1b[33m${s}\x1b[0m` : s);
const red = (s) => (tty() ? `\x1b[31m${s}\x1b[0m` : s);

class Command {
  static signature = '';
  static description = '';
  argument(name) { return this.__args[name]; }
  arguments() { return { ...this.__args }; }
  option(name) { return this.__opts[name]; }
  options() { return { ...this.__opts }; }
  line(text = '') { console.log('  ' + text); }
  info(text) { console.log('  ' + green(text)); }
  comment(text) { console.log('  ' + dim(text)); }
  warn(text) { console.log('  ' + yellow(text)); }
  error(text) { console.error('  ' + red(text)); }
  newLine(n = 1) { console.log('\n'.repeat(n - 1)); }
  table(rows, headers) {
    if (!rows.length) return;
    headers = headers || Object.keys(rows[0]);
    const w = headers.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(Array.isArray(r) ? r[i] : r[h] ?? '').length)));
    const line = (cells) => '  ' + cells.map((c, i) => String(c ?? '').padEnd(w[i])).join('  ');
    console.log(line(headers)); console.log('  ' + w.map((n) => '─'.repeat(n)).join('  '));
    rows.forEach((r) => console.log(line(Array.isArray(r) ? r : headers.map((h) => r[h]))));
  }
  ask(question, fallback) {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((res) => rl.question(`  ${question}${fallback ? dim(` [${fallback}]`) : ''} `, (a) => { rl.close(); res(a || fallback || ''); }));
  }
  async confirm(question, fallback = false) { const a = (await this.ask(`${question} (yes/no)`, fallback ? 'yes' : 'no')).toLowerCase(); return a === 'y' || a === 'yes'; }
  call(line) { return require('../artisan-more.js').runCommand(line); }
}

module.exports = { Command };
