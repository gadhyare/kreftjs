/*
 * Terminal UI & Styling for Som.js
 * Crisp typography, box frames, status badges, and progress bars.
 * Strictly 0 border-radius (sharp box-drawing characters).
 */
const tty = Boolean(process.stdout.isTTY);

const c = {
  reset: (s) => (tty ? `\x1b[0m${s}\x1b[0m` : s),
  bold: (s) => (tty ? `\x1b[1m${s}\x1b[22m` : s),
  dim: (s) => (tty ? `\x1b[2m${s}\x1b[22m` : s),
  italic: (s) => (tty ? `\x1b[3m${s}\x1b[23m` : s),
  underline: (s) => (tty ? `\x1b[4m${s}\x1b[24m` : s),
  inverse: (s) => (tty ? `\x1b[7m${s}\x1b[27m` : s),

  black: (s) => (tty ? `\x1b[30m${s}\x1b[39m` : s),
  red: (s) => (tty ? `\x1b[31m${s}\x1b[39m` : s),
  green: (s) => (tty ? `\x1b[32m${s}\x1b[39m` : s),
  yellow: (s) => (tty ? `\x1b[33m${s}\x1b[39m` : s),
  blue: (s) => (tty ? `\x1b[34m${s}\x1b[39m` : s),
  magenta: (s) => (tty ? `\x1b[35m${s}\x1b[39m` : s),
  cyan: (s) => (tty ? `\x1b[36m${s}\x1b[39m` : s),
  white: (s) => (tty ? `\x1b[37m${s}\x1b[39m` : s),
  gray: (s) => (tty ? `\x1b[90m${s}\x1b[39m` : s),

  bgBlack: (s) => (tty ? `\x1b[40m${s}\x1b[49m` : s),
  bgRed: (s) => (tty ? `\x1b[41m${s}\x1b[49m` : s),
  bgGreen: (s) => (tty ? `\x1b[42m${s}\x1b[49m` : s),
  bgYellow: (s) => (tty ? `\x1b[43m${s}\x1b[49m` : s),
  bgBlue: (s) => (tty ? `\x1b[44m${s}\x1b[49m` : s),
  bgMagenta: (s) => (tty ? `\x1b[45m${s}\x1b[49m` : s),
  bgCyan: (s) => (tty ? `\x1b[46m${s}\x1b[49m` : s),
  bgWhite: (s) => (tty ? `\x1b[47m${s}\x1b[49m` : s),
};

// Strip ANSI codes when calculating visible string length
function stripAnsi(str) {
  return String(str || '').replace(/\x1b\[[0-9;]*m/g, '');
}

function stringWidth(str) {
  return stripAnsi(str).length;
}

// Crisp square badge
function badge(text, bgFn = c.bgCyan, fgFn = c.black) {
  return tty ? bgFn(fgFn(` ${text} `)) : `[${text}]`;
}

// Progress Bar
class ProgressBar {
  constructor(total, { width = 28, label = '', stream = process.stdout } = {}) {
    this.total = Math.max(1, total);
    this.current = 0;
    this.width = width;
    this.label = label;
    this.stream = stream;
    this.isTTY = Boolean(stream && stream.isTTY);
  }

  update(current, label) {
    this.current = Math.min(this.total, Math.max(0, current));
    if (label !== undefined) this.label = label;
    this.render();
  }

  tick(label) {
    this.update(this.current + 1, label);
  }

  render() {
    const ratio = Math.min(1, Math.max(0, this.current / this.total));
    const percent = Math.floor(ratio * 100);
    const filledLength = Math.round(this.width * ratio);
    const emptyLength = Math.max(0, this.width - filledLength);

    const filledBar = c.cyan('█'.repeat(filledLength));
    const emptyBar = c.gray('░'.repeat(emptyLength));
    const bar = `[${filledBar}${emptyBar}]`;
    const count = c.dim(`(${this.current}/${this.total})`);
    const pct = c.bold(`${String(percent).padStart(3)}%`);
    const lbl = this.label ? ' ' + c.dim(this.label) : '';

    const line = `  ${bar} ${pct} ${count}${lbl}`;

    if (this.isTTY) {
      this.stream.cursorTo(0);
      this.stream.write(line);
      this.stream.clearLine(1);
    } else {
      if (this.current === this.total || this.current === 1) {
        this.stream.write(stripAnsi(line) + '\n');
      }
    }
  }

  complete(message = '') {
    this.current = this.total;
    if (this.isTTY) {
      this.stream.cursorTo(0);
      this.stream.clearLine(0);
      if (message) this.stream.write(`  ${c.green('✔')} ${message}\n`);
    } else if (message) {
      this.stream.write(`  ✔ ${message}\n`);
    }
  }
}

function createProgressBar(total, options) {
  return new ProgressBar(total, options);
}

// Render a sharp ASCII box with zero radius
function renderBox(lines, { title = '', width = 64, borderColor = c.cyan } = {}) {
  const contentWidth = width - 4; // account for borders and padding
  const topTitle = title ? ` ${title} ` : '';
  const topDashes = Math.max(0, contentWidth - stringWidth(topTitle));
  const topBorder = borderColor('┌─' + c.bold(topTitle) + '─'.repeat(topDashes) + '┐');
  const bottomBorder = borderColor('└' + '─'.repeat(contentWidth + 2) + '┘');
  const divider = borderColor('├' + '─'.repeat(contentWidth + 2) + '┤');

  const renderedLines = lines.map((line) => {
    if (line === '---' || line === '<divider>') return divider;
    const cleanLen = stringWidth(line);
    const padding = Math.max(0, contentWidth - cleanLen);
    return borderColor('│ ') + line + ' '.repeat(padding) + borderColor(' │');
  });

  return [topBorder, ...renderedLines, bottomBorder].join('\n');
}

// Awesome dev server banner
function renderDevBanner({
  version = require('../package.json').version,
  port = 8000,
  host = '127.0.0.1',
  start = '',
  root = '.',
  envFile = null,
  hot = true,
  routesCount = 0,
  serverRoutesCount = 0,
  adminPath = null,
  database = null,
} = {}) {
  const localUrl = `http://localhost:${port}/${start}`;
  const netUrl = host !== '127.0.0.1' && host !== 'localhost' ? `http://${host}:${port}/${start}` : null;

  const lines = [
    `  ${c.bold(c.white('SOM.JS'))} ${c.dim('v' + version)}  ${badge('DEV SERVER', c.bgCyan, c.black)}  ${c.dim('⚡ Ready in 45ms')}`,
    '---',
    `  ${c.cyan('➜')}  ${c.bold('Local:')}    ${c.underline(c.cyan(localUrl))}`,
  ];

  if (netUrl) {
    lines.push(`  ${c.cyan('➜')}  ${c.bold('Network:')}  ${c.underline(c.cyan(netUrl))}`);
  }

  lines.push('---');
  lines.push(`  ${c.dim('•')} ${c.bold('Mode:')}     ${hot ? c.green('Hot Reload Active') : c.dim('Standard')}`);
  lines.push(`  ${c.dim('•')} ${c.bold('Root:')}     ${c.dim(root)}`);

  if (envFile) {
    lines.push(`  ${c.dim('•')} ${c.bold('Env:')}      ${c.dim(envFile)}`);
  }
  if (database) {
    lines.push(`  ${c.dim('•')} ${c.bold('Database:')} ${c.green(database)}`);
  }
  if (routesCount > 0) {
    lines.push(`  ${c.dim('•')} ${c.bold('API:')}      ${c.cyan(routesCount + ' routes')} ${c.dim('(som route:list)')}`);
  }
  if (serverRoutesCount > 0) {
    lines.push(`  ${c.dim('•')} ${c.bold('Server:')}   ${c.cyan(serverRoutesCount + ' custom endpoints')}`);
  }
  if (adminPath) {
    lines.push(`  ${c.dim('•')} ${c.bold('Admin:')}    ${c.magenta(`http://localhost:${port}/admin/`)}`);
  }

  lines.push('---');
  lines.push(`  ${c.dim('Press')} ${c.bold('Ctrl+C')} ${c.dim('to stop the server ·')} ${c.dim('Press')} ${c.bold('h')} ${c.dim('for help')}`);

  return '\n' + renderBox(lines, { width: 66, borderColor: c.cyan }) + '\n';
}

module.exports = {
  ...c,
  stripAnsi,
  stringWidth,
  badge,
  ProgressBar,
  createProgressBar,
  renderBox,
  renderDevBanner,
};
