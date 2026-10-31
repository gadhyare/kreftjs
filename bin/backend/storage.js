/*
 * Storage: disk management, files and uploads.
 *
 *   // a form with <input type="file" name="avatar">, sent with api.post('/api/avatar', new FormData(form))
 *   const data = await req.validate({ avatar: 'required|image|max:2048' })    // KB
 *   const file = req.file('avatar')            // { name, size, type, extension() }
 *   const stored = await file.store('avatars') // 'avatars/3f9c…e1.jpg' on the public disk
 *   Storage.url(stored)                        // '/storage/avatars/3f9c…e1.jpg' — som dev and som serve send it
 *
 *   await Storage.put('reports/today.txt', 'hello')          // the local disk: backend/storage/app (private)
 *   await Storage.get('reports/today.txt')   Storage.exists(…)   Storage.delete(…)   Storage.files('reports')
 *   await Storage.disk('public').put('logo.svg', svg)          // backend/storage/app/public, served at /storage
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const base = () => require('./app.js').baseDir() || process.cwd();
const roots = { local: () => path.join(base(), 'storage', 'app'), public: () => path.join(base(), 'storage', 'app', 'public') };

function disk(name = process.env.FILESYSTEM_DISK || 'local') {
  if (!roots[name]) throw new Error(`Unknown disk "${name}": local or public.`);
  const root = () => roots[name]();
  const full = (p) => {
    const f = path.resolve(root(), String(p).replace(/^\/+/, ''));
    if (f !== root() && !f.startsWith(root() + path.sep)) throw Object.assign(new Error('That path is outside the disk.'), { status: 400 });
    return f;
  };
  const d = {
    path: (p = '') => full(p),
    async put(p, content) { const f = full(p); await fs.promises.mkdir(path.dirname(f), { recursive: true }); await fs.promises.writeFile(f, content); return p; },
    async get(p) { return fs.promises.readFile(full(p), 'utf8'); },
    async getBuffer(p) { return fs.promises.readFile(full(p)); },
    async exists(p) { try { await fs.promises.access(full(p)); return true; } catch (_) { return false; } },
    async missing(p) { return !(await d.exists(p)); },
    async delete(...paths) { for (const p of paths.flat()) await fs.promises.rm(full(p), { force: true }); return true; },
    async size(p) { return (await fs.promises.stat(full(p))).size; },
    async lastModified(p) { return (await fs.promises.stat(full(p))).mtime; },
    async append(p, text) { const f = full(p); await fs.promises.mkdir(path.dirname(f), { recursive: true }); await fs.promises.appendFile(f, text); return true; },
    async copy(from, to) { const f = full(to); await fs.promises.mkdir(path.dirname(f), { recursive: true }); await fs.promises.copyFile(full(from), f); return true; },
    async move(from, to) { const f = full(to); await fs.promises.mkdir(path.dirname(f), { recursive: true }); await fs.promises.rename(full(from), f); return true; },
    async files(dir = '', recursive = false) {
      const out = [];
      const walk = async (rel) => {
        let entries = [];
        try { entries = await fs.promises.readdir(full(rel), { withFileTypes: true }); } catch (_) { return; }
        for (const e of entries) {
          const r = rel ? rel + '/' + e.name : e.name;
          if (e.isDirectory()) { if (recursive) await walk(r); } else out.push(r);
        }
      };
      await walk(String(dir).replace(/^\/+|\/+$/g, ''));
      return out;
    },
    allFiles: (dir = '') => d.files(dir, true),
    async makeDirectory(dir) { await fs.promises.mkdir(full(dir), { recursive: true }); return true; },
    async deleteDirectory(dir) { await fs.promises.rm(full(dir), { recursive: true, force: true }); return true; },
    url: (p) => (name === 'public' ? '/storage/' + String(p).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/') : null),
  };
  return d;
}
const Storage = { disk, ...disk('local') };
Object.defineProperty(Storage, 'url', { value: (p) => disk('public').url(p) });

/* ------------------------------------------------------------------ uploads */
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv', 'application/zip': 'zip', 'application/json': 'json', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3' };
class UploadedFile {
  constructor({ name, type, buffer }) { this.name = name; this.type = type || 'application/octet-stream'; this.buffer = buffer; this.size = buffer.length; }
  get originalName() { return this.name; }
  extension() { const e = path.extname(this.name || '').slice(1).toLowerCase(); return e || MIME_EXT[this.type] || 'bin'; }
  isImage() { return /^image\/(jpeg|png|gif|webp|avif|bmp|svg\+xml)$/.test(this.type) && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(this.extension()); }
  hashName() { return crypto.randomBytes(16).toString('hex') + '.' + this.extension(); }
  // store('avatars') → 'avatars/<random>.jpg' (a random name: never the visitor's file name)
  async store(dir = '', diskName = 'public') { return this.storeAs(dir, this.hashName(), diskName); }
  async storeAs(dir, name, diskName = 'public') {
    const safe = path.basename(String(name)).replace(/[^\w.-]+/g, '_');
    const p = (dir ? String(dir).replace(/^\/+|\/+$/g, '') + '/' : '') + safe;
    await disk(diskName).put(p, this.buffer);
    return p;
  }
  toJSON() { return { name: this.name, type: this.type, size: this.size }; }
}

const { isBadKey } = require('../safe-json.js');

// multipart/form-data → { fields, files } (files are UploadedFile; several with one name become a list)
function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) throw Object.assign(new Error('The form has no boundary.'), { status: 400 });
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  const fields = {}, files = {};
  const add = (obj, key, value) => {
    const k = key.replace(/\[\]$/, '');
    if (isBadKey(k)) return;
    if (key.endsWith('[]') || k in obj) obj[k] = [].concat(obj[k] === undefined ? [] : obj[k], value);
    else obj[k] = value;
  };
  let pos = buffer.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (buffer.slice(start, start + 2).toString() === '--') break;
    const headEnd = buffer.indexOf('\r\n\r\n', start);
    if (headEnd === -1) break;
    const head = buffer.slice(start + 2, headEnd).toString('utf8');
    const next = buffer.indexOf(boundary, headEnd + 4);
    if (next === -1) break;
    const body = buffer.slice(headEnd + 4, next - 2); // without the \r\n before the boundary
    const name = /name="([^"]*)"/i.exec(head);
    const filename = /filename="([^"]*)"/i.exec(head);
    const type = /content-type:\s*([^\r\n]+)/i.exec(head);
    if (name) {
      if (filename) { if (filename[1]) add(files, name[1], new UploadedFile({ name: path.basename(filename[1]), type: type && type[1].trim(), buffer: body })); }
      else add(fields, name[1], body.toString('utf8'));
    }
    pos = next;
  }
  return { fields, files };
}

module.exports = { Storage, disk, UploadedFile, parseMultipart };
