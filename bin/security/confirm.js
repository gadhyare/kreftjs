'use strict';
const readline = require('readline');
const { colors, colorReport } = require('./colors.js');
const { render, renderStatus } = require('./install.js');

// readline also works in IDE terminals and with redirected streams. TTY detection
// must not silently remove the developer's decision from the install flow.
function confirmPackage(report, { input = process.stdin, output = process.stdout, verbose = false } = {}) {
  const c = colors(output);
  // a summary, not one block per package: a mobile app has over a hundred (--verbose shows them all)
  output.write(colorReport(verbose ? render(report) : renderStatus(report), output) + '\n');
  const names = report.requested.map(r => {
    const node = report.packages.find(n => n.location === `node_modules/${r.name}`);
    return `${r.name}@${node?.version || r.version}`;
  }).join(', ');
  output.write('\n' + c.bold(c.cyan(`  Security checks passed for ${names}. Choose what to do:`)) + '\n');
  output.write(c.green('    1) Allow installation once') + '\n');
  output.write(c.yellow('    2) Disallow installation once (default)') + '\n');
  output.write(c.cyan('    3) Always allow this package in this project') + '\n');
  output.write(c.red('    4) Never allow this package in this project') + '\n\n');
  const question = c.bold('  Installation [1/2/3/4]: ');
  if (input.destroyed || input.readableEnded) {
    output.write(question + '\nNo input available. Installation cancelled; use --yes for an unattended install after security checks.\n');
    return Promise.resolve(false);
  }
  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
  return new Promise(resolve => {
    let settled = false;
    const finish = (value, reason) => {
      if (settled) return;
      settled = true;
      const said = value === 'always' ? 'Always allowed: the choice is saved in your project settings. Installing approved packages...'
        : value === 'never' ? 'Never allowed: the choice is saved in your project settings. Installation cancelled; dependencies unchanged.'
          : value ? 'Allowed. Installing approved packages...' : reason || 'Disallowed. Installation cancelled; nothing was changed.';
      output.write('\n' + (value === true || value === 'always' ? c.green(said) : c.yellow(said)) + '\n');
      rl.close();
      resolve(value);
    };
    rl.once('close', () => finish(false, 'No answer received. Installation cancelled; use --yes for an unattended install after security checks.'));
    rl.once('SIGINT', () => finish(false));
    rl.once('error', error => finish(false, `Cannot read confirmation: ${error.message}. Installation cancelled.`));
    rl.question(question, answer => {
      const a = answer.trim();
      // once: true or false; for good: 'always' or 'never' (the installer saves these)
      finish(/^(3|r|always|always allow)$/i.test(a) ? 'always' : /^(4|n|never|never allow)$/i.test(a) ? 'never' : /^(1|a|allow|y|yes)$/i.test(a));
    });
  });
}
module.exports = { confirmPackage };
