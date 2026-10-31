/*
 * Developer Error Details Page for Som.js
 * Renders an interactive, rich debug page in development with code context,
 * stack trace frames, request inspection, and environment info.
 */
const fs = require('fs');
const path = require('path');

function parseStack(stack) {
  const lines = String(stack || '').split('\n').slice(1);
  const frames = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) continue;
    const m = trimmed.match(/^at\s+(?:(async\s+)?([^\s(]+)\s+\((.+):(\d+):(\d+)\)|(.+):(\d+):(\d+))$/);
    if (m) {
      const isMethod = Boolean(m[3]);
      const file = isMethod ? m[3] : m[6];
      const lineNum = parseInt(isMethod ? m[4] : m[7], 10);
      const colNum = parseInt(isMethod ? m[5] : m[8], 10);
      const fn = isMethod ? (m[1] ? 'async ' : '') + m[2] : '<anonymous>';
      const isApp = !file.includes('node_modules') && !file.startsWith('node:') && !file.includes('internal/');
      frames.push({ fn, file, line: lineNum, col: colNum, isApp });
    } else {
      frames.push({ raw: trimmed, isApp: false });
    }
  }
  return frames;
}

function getCodeSnippet(filePath, targetLine, radius = 6) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const allLines = content.split(/\r?\n/);
    const start = Math.max(1, targetLine - radius);
    const end = Math.min(allLines.length, targetLine + radius);
    const snippet = [];
    for (let i = start; i <= end; i++) {
      snippet.push({
        num: i,
        code: allLines[i - 1] ?? '',
        isTarget: i === targetLine,
      });
    }
    return { start, end, lines: snippet };
  } catch (_) {
    return null;
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderErrorPage(err, req = null, { status = 500 } = {}) {
  const errName = err && err.name ? err.name : 'Error';
  const errMessage = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? err.stack : '';
  const frames = parseStack(stack);
  const topAppFrame = frames.find((f) => f.isApp && f.file) || frames.find((f) => f.file) || null;
  const snippet = topAppFrame ? getCodeSnippet(topAppFrame.file, topAppFrame.line) : null;

  const method = req ? (req.method || 'GET').toUpperCase() : '';
  const url = req ? (req.url || '/') : '';
  const headers = req ? (req.headers || {}) : {};
  const query = req && req.query ? req.query : {};
  const body = req && req.body ? req.body : {};
  const params = req && req.params ? req.params : {};
  const ip = req && typeof req.ip === 'function' ? req.ip() : (req && req.ip) || '';

  const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB';
  const nodeVersion = process.version;
  const platform = `${process.platform} (${process.arch})`;
  const somVersion = require('../../package.json').version;
  const dateStr = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(errName)}: ${escapeHtml(errMessage)}</title>
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    :root {
      --bg: #09090b;
      --card-bg: #121215;
      --card-border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --accent: #ef4444;
      --accent-dim: #7f1d1d;
      --code-bg: #18181b;
      --code-target: #2a1515;
      --code-border: #3f3f46;
      --tag-bg: #27272a;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 20px 80px;
    }
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid var(--accent);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .brand-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 700;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-badge {
      background: var(--accent);
      color: #fff;
      font-weight: 700;
      padding: 4px 10px;
      font-size: 13px;
      font-family: var(--font-mono);
    }
    .error-title-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-left: 4px solid var(--accent);
      padding: 24px;
      margin-bottom: 24px;
    }
    .error-type {
      color: var(--accent);
      font-family: var(--font-mono);
      font-size: 15px;
      font-weight: 600;
      margin: 0 0 8px;
    }
    .error-message {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 12px;
      word-break: break-word;
      font-family: var(--font-mono);
    }
    .error-location {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .file-pill {
      background: var(--tag-bg);
      color: #ffffff;
      padding: 2px 8px;
      font-weight: 600;
    }
    .btn-copy {
      background: #27272a;
      color: #fff;
      border: 1px solid #3f3f46;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 12px;
      font-family: var(--font-mono);
      font-weight: 600;
      transition: background 0.15s;
    }
    .btn-copy:hover {
      background: #3f3f46;
    }
    .btn-copy:active {
      background: #52525b;
    }
    .code-preview {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      margin-bottom: 24px;
    }
    .code-header {
      background: #141417;
      padding: 8px 16px;
      border-bottom: 1px solid var(--card-border);
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
    }
    .code-lines {
      padding: 8px 0;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.6;
      overflow-x: auto;
    }
    .code-line {
      display: flex;
      padding: 1px 16px;
    }
    .code-line.target {
      background: var(--code-target);
      border-left: 3px solid var(--accent);
      color: #fca5a5;
    }
    .code-num {
      width: 48px;
      text-align: right;
      padding-right: 16px;
      color: #52525b;
      user-select: none;
      flex-shrink: 0;
    }
    .code-line.target .code-num {
      color: var(--accent);
      font-weight: 700;
    }
    .code-content {
      white-space: pre;
    }
    .tabs-nav {
      display: flex;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 16px;
      gap: 2px;
    }
    .tab-btn {
      background: var(--card-bg);
      color: var(--text-muted);
      border: 1px solid transparent;
      border-bottom: none;
      padding: 10px 18px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-sans);
    }
    .tab-btn.active {
      background: #1f1f23;
      color: #ffffff;
      border-color: var(--card-border);
      border-top: 2px solid var(--accent);
    }
    .tab-content {
      display: none;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 20px;
    }
    .tab-content.active {
      display: block;
    }
    .trace-item {
      padding: 8px 12px;
      border-bottom: 1px solid #1a1a1e;
      font-family: var(--font-mono);
      font-size: 12px;
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .trace-item:last-child {
      border-bottom: none;
    }
    .trace-item.app {
      background: rgba(239, 68, 68, 0.05);
      border-left: 2px solid var(--accent);
    }
    .trace-fn {
      font-weight: 700;
      color: #fff;
      min-width: 180px;
    }
    .trace-loc {
      color: var(--text-muted);
      word-break: break-all;
    }
    .table-data {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .table-data th, .table-data td {
      border: 1px solid var(--card-border);
      padding: 8px 12px;
      text-align: left;
    }
    .table-data th {
      background: #18181b;
      color: var(--text-muted);
      width: 220px;
    }
    .table-data td {
      word-break: break-all;
    }
    .json-block {
      background: #09090b;
      border: 1px solid var(--card-border);
      padding: 12px;
      margin: 0;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #e4e4e7;
      overflow-x: auto;
    }
    .empty-text {
      color: #71717a;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar">
      <div class="brand-title">
        <span>SOM.JS EXCEPTION DEBUGGER</span>
        <span style="color: var(--text-muted)">v${escapeHtml(somVersion)}</span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn-copy" onclick="copyError()">COPY ERROR</button>
        <span class="status-badge">${escapeHtml(status)}</span>
      </div>
    </div>

    <div class="error-title-card">
      <div class="error-type">${escapeHtml(errName)}</div>
      <div class="error-message">${escapeHtml(errMessage)}</div>
      ${topAppFrame ? `
      <div class="error-location">
        <span>At:</span>
        <span class="file-pill">${escapeHtml(topAppFrame.file)}</span>
        <span>line <strong>${escapeHtml(topAppFrame.line)}</strong>:${escapeHtml(topAppFrame.col)}</span>
      </div>` : ''}
    </div>

    ${snippet ? `
    <div class="code-preview">
      <div class="code-header">
        <span>${escapeHtml(topAppFrame.file)}:${escapeHtml(topAppFrame.line)}</span>
        <span>Lines ${escapeHtml(snippet.start)} - ${escapeHtml(snippet.end)}</span>
      </div>
      <div class="code-lines">
        ${snippet.lines.map((l) => `
        <div class="code-line${l.isTarget ? ' target' : ''}">
          <span class="code-num">${l.num}</span>
          <span class="code-content">${escapeHtml(l.code)}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="tabs-nav">
      <button class="tab-btn active" onclick="showTab('tab-trace', this)">Stack Trace (${frames.length})</button>
      <button class="tab-btn" onclick="showTab('tab-request', this)">Request Details</button>
      <button class="tab-btn" onclick="showTab('tab-headers', this)">Headers</button>
      <button class="tab-btn" onclick="showTab('tab-env', this)">Environment</button>
    </div>

    <div id="tab-trace" class="tab-content active">
      <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
        <label style="color: var(--text-muted); font-size: 12px; cursor: pointer;">
          <input type="checkbox" id="vendor-toggle" onchange="toggleVendorFrames(this.checked)" checked style="margin-right: 6px;">
          Highlight application frames only
        </label>
      </div>
      <div id="trace-list">
        ${frames.map((f) => `
        <div class="trace-item${f.isApp ? ' app' : ' vendor'}">
          <div class="trace-fn">${escapeHtml(f.fn || '<anonymous>')}</div>
          <div class="trace-loc">${escapeHtml(f.file || f.raw || '')}${f.line ? `:${escapeHtml(f.line)}:${escapeHtml(f.col)}` : ''}</div>
        </div>`).join('')}
      </div>
    </div>

    <div id="tab-request" class="tab-content">
      <table class="table-data" style="margin-bottom: 20px;">
        <tr><th>Method</th><td><span class="file-pill">${escapeHtml(method || 'N/A')}</span></td></tr>
        <tr><th>URL</th><td>${escapeHtml(url || '/')}</td></tr>
        <tr><th>Client IP</th><td>${escapeHtml(ip || '127.0.0.1')}</td></tr>
      </table>

      <h4 style="margin: 16px 0 8px; font-size: 13px; text-transform: uppercase; color: var(--text-muted);">Route Parameters</h4>
      ${Object.keys(params).length ? `
        <table class="table-data">
          ${Object.entries(params).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')}
        </table>` : '<p class="empty-text">No route parameters</p>'}

      <h4 style="margin: 20px 0 8px; font-size: 13px; text-transform: uppercase; color: var(--text-muted);">Query Parameters</h4>
      ${Object.keys(query).length ? `
        <table class="table-data">
          ${Object.entries(query).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')}
        </table>` : '<p class="empty-text">No query parameters</p>'}

      <h4 style="margin: 20px 0 8px; font-size: 13px; text-transform: uppercase; color: var(--text-muted);">Request Body</h4>
      ${body && Object.keys(body).length ? `
        <pre class="json-block">${escapeHtml(JSON.stringify(body, null, 2))}</pre>` : '<p class="empty-text">Empty body</p>'}
    </div>

    <div id="tab-headers" class="tab-content">
      ${Object.keys(headers).length ? `
      <table class="table-data">
        ${Object.entries(headers).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(Array.isArray(v) ? v.join(', ') : v)}</td></tr>`).join('')}
      </table>` : '<p class="empty-text">No headers</p>'}
    </div>

    <div id="tab-env" class="tab-content">
      <table class="table-data">
        <tr><th>Node.js Version</th><td>${escapeHtml(nodeVersion)}</td></tr>
        <tr><th>Platform</th><td>${escapeHtml(platform)}</td></tr>
        <tr><th>Som.js Version</th><td>${escapeHtml(somVersion)}</td></tr>
        <tr><th>Memory Usage</th><td>${escapeHtml(memory)}</td></tr>
        <tr><th>Timestamp</th><td>${escapeHtml(dateStr)}</td></tr>
      </table>
    </div>
  </div>

  <script>
    function showTab(id, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(id).classList.add('active');
    }

    function toggleVendorFrames(hideVendor) {
      document.querySelectorAll('.trace-item.vendor').forEach(el => {
        el.style.opacity = hideVendor ? '0.4' : '1';
      });
    }

    function copyError() {
      const text = ${JSON.stringify(errName + ': ' + errMessage + '\n\n' + stack)};
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.btn-copy');
        const orig = btn.textContent;
        btn.textContent = 'COPIED!';
        btn.style.background = '#15803d';
        setTimeout(() => {
          btn.textContent = orig;
          btn.style.background = '';
        }, 2000);
      });
    }
  </script>
</body>
</html>`;
}

module.exports = { renderErrorPage, parseStack, getCodeSnippet };
