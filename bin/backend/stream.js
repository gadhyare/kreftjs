// Sending a file the way a video player needs it: byte ranges (206), so the browser can seek and Safari plays at all.
const fs = require('fs');
const path = require('path');

const MEDIA_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.wav': 'audio/wav', '.opus': 'audio/ogg', '.flac': 'audio/flac',
  '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.m4s': 'video/iso.segment', '.mpd': 'application/dash+xml', '.vtt': 'text/vtt',
};

// "bytes=0-99", "bytes=100-", "bytes=-500" -> { start, end } | null (no range) | false (cannot be satisfied)
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim()); // one range only; several ranges are answered with the whole file
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start, end;
  if (m[1] === '') { // the last N bytes
    const n = Number(m[2]);
    if (n === 0) return false;
    start = Math.max(0, size - n); end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return false;
  return { start, end };
}

// sendFile(req, res, file, { type, headers, status, download })
function sendFile(req, res, file, opts = {}) {
  req = req || res.req;
  let stat;
  try { stat = fs.statSync(file); if (!stat.isFile()) throw new Error('not a file'); } catch (_) {
    if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  const size = stat.size;
  const type = opts.type || MEDIA_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const etag = `W/"${size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    ...(opts.download ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}` } : {}),
    ...(opts.headers || {}),
  };
  const method = (req && req.method) || 'GET';
  const h = (req && req.headers) || {};

  if (h['if-none-match'] === etag && !h.range) { res.writeHead(304, headers); return res.end(); }

  let range = parseRange(h.range, size);
  // If-Range: only honor the range when the file is still the one the client started with
  if (range && h['if-range'] && h['if-range'] !== etag && h['if-range'] !== headers['Last-Modified']) range = null;
  if (range === false) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Range not satisfiable');
  }

  let status = opts.status || 200, start = 0, end = size - 1;
  if (range) { status = 206; ({ start, end } = range); headers['Content-Range'] = `bytes ${start}-${end}/${size}`; }
  headers['Content-Length'] = size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (method === 'HEAD' || size === 0) return res.end();

  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy()); // the viewer seeked or left: stop reading
  stream.pipe(res);
}

module.exports = { sendFile, parseRange, MEDIA_TYPES };
