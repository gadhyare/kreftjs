/*
 * A REST API made from the tables of a database (used by `kreft dev --db` and `kreft serve --db`).
 *
 *   GET    /api                    the tables you can use
 *   GET    /api/posts              rows   ?userId=3  ?title_like=som  ?likes_gte=5  ?q=text
 *                                         ?_sort=-created_at,title  ?_limit=20&_page=2   (header X-Total-Count)
 *   GET    /api/posts/1            one row
 *   POST   /api/posts              create (201, the new row)
 *   PUT    /api/posts/1            replace (columns you leave out become empty)
 *   PATCH  /api/posts/1            change some columns
 *   DELETE /api/posts/1            remove (204)
 *
 * Standard errors: 404 { message }, 422 { message, errors: { column: [...] } }.
 * Required columns (NOT NULL without a default) are checked before anything reaches the database.
 *
 * Which tables, and what each allows, comes from `tables` (kreft.config.json):
 *   { "posts": true, "users": { "write": false, "hidden": ["password"] }, "logs": false }
 * `kreft dev` shows every table unless you list them; `kreft serve` shows only the tables you list.
 */
const { validate } = require('../kreft.js'); // the same rules as Kreft.validate in the browser
const MAX_BODY = 1024 * 1024;
const MAX_ROWS = 1000;

function createDbApi(db, { tables: allow = null, production = false, prefix = '/api', log = console } = {}) {
  const isProd = Boolean(production || process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production');
  let schema = null; // tables, read once (and again after a schema change)
  const load = async () => {
    const all = await db.tables();
    const out = new Map();
    for (const t of all) {
      if (t.name === 'som_migrations') continue;
      let rules = allow ? allow[t.name] : true;
      if (rules == null || rules === false) continue;
      if (rules === true) rules = {};
      const write = rules.write === undefined ? true : rules.write;
      out.set(t.name, {
        ...t,
        hidden: new Set(rules.hidden || []),
        rules: rules.rules || null, // { "title": "required|min:3", "email": "required|email" }
        can: {
          read: rules.read !== false,
          create: write === true || (Array.isArray(write) && write.includes('create')),
          update: write === true || (Array.isArray(write) && write.includes('update')),
          delete: write === true || (Array.isArray(write) && write.includes('delete')),
        },
        cols: new Map(t.columns.map((c) => [c.name, c])),
      });
    }
    return out;
  };
  // `kreft serve` reads the tables once; `kreft dev` looks again every 2 s, so a new table shows up by itself
  let loadedAt = 0;
  const tables = async () => {
    if (schema && (production || Date.now() - loadedAt < 2000)) return schema;
    schema = await load();
    loadedAt = Date.now();
    return schema;
  };

  const send = (res, status, data, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...headers });
    res.end(data === undefined ? '' : JSON.stringify(data));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let raw = '', size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('The body is too large (1 MB at most).'), { status: 413 })); req.destroy(); } else raw += c; });
    req.on('end', () => { try { resolve(raw ? require('./safe-json.js').parseJson(raw) : {}); } catch (_) { resolve(null); } });
    req.on('error', reject);
  });
  // rows as JSON: hidden columns out, booleans as true / false
  const clean = (t, row) => {
    if (!row) return row;
    const out = {};
    for (const k of Object.keys(row)) {
      if (t.hidden.has(k)) continue;
      const c = t.cols.get(k);
      let v = row[k];
      if (c && c.bool && (v === 0 || v === 1)) v = !!v;
      if (typeof v === 'bigint') v = Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
      out[k] = v;
    }
    return out;
  };
  const invalid = (errors) => ({ message: Object.values(errors)[0][0], errors });
  const label = (k) => k.replace(/_/g, ' ');
  // what a POST / PUT / PATCH may write, and the 422 errors
  function pick(t, body, mode) {
    const data = {}, errors = {};
    for (const [k, v] of Object.entries(body)) {
      const c = t.cols.get(k);
      if (!c || (c.auto && mode !== 'create') || k === t.key && mode !== 'create') continue;
      if (c.auto && (v === null || v === undefined || v === '')) continue;
      data[k] = v;
    }
    for (const c of t.columns) {
      if (!c.required) continue;
      const v = data[c.name];
      const missing = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
      if (mode === 'patch' ? c.name in data && missing : missing) errors[c.name] = [`The ${label(c.name)} field is required.`];
    }
    // your own rules from kreft.config.json (PATCH checks only the columns it sends)
    if (t.rules) {
      const found = validate({ ...body }, t.rules, { only: mode === 'patch' ? Object.keys(body) : null });
      for (const k of Object.keys(found)) if (!errors[k]) errors[k] = found[k];
    }
    // PUT replaces the row: columns left out become empty (NULL); ones that can't be empty keep their value
    if (mode === 'put') for (const c of t.columns) if (!(c.name in data) && c.nullable && !c.auto && c.name !== t.key) data[c.name] = null;
    return { data, errors };
  }
  // a database refusal (unique, foreign key, check…) becomes a 422 the form can show
  function dbError(e) {
    const msg = String(e && e.message || e) + (e && e.detail ? ' ' + e.detail : ''); // Postgres puts the column in .detail
    const unique = /unique|duplicate/i.test(msg);
    const fk = /foreign key/i.test(msg);
    const notNull = /not.?null|cannot be null|doesn't have a default/i.test(msg);
    if (!unique && !fk && !notNull && !/check constraint|constraint failed|violates/i.test(msg)) return null;
    const col = (msg.match(/Key \((\w+)\)/) || msg.match(/constraint failed: \w+\.(\w+)/i) || msg.match(/column "?(\w+)"?/i) || msg.match(/for key '(?:\w+\.)?(\w+)'/i) || [])[1];
    const text = unique ? 'This value is already taken.' : fk ? 'This refers to something that does not exist.' : notNull ? 'This field is required.' : 'This value is not allowed.';
    return { message: col ? `The ${label(col)} field: ${text}` : text, errors: col ? { [col]: [text] } : {} };
  }

  async function one(t, id) {
    const rows = await db.query(`SELECT * FROM ${db.q(t.name)} WHERE ${db.q(t.key)} = ?`, [id]);
    return rows[0];
  }

  async function handler(req, res, urlPath) {
    const url = new URL(req.url, 'http://x');
    const parts = urlPath.slice(prefix.length).split('/').filter(Boolean).map(decodeURIComponent);
    const [name, id, extra] = parts;
    const method = req.method.toUpperCase();
    try {
      const all = await tables();
      if (!name) return send(res, 200, [...all.keys()]);
      const t = all.get(name);
      if (!t || extra !== undefined) return send(res, 404, { message: `Nothing at ${prefix}/${parts.join('/')}` });

      if (method === 'GET' && !id) {
        if (!t.can.read) return send(res, 403, { message: `${name} can't be read.` });
        const where = [], params = [];
        let limit = MAX_ROWS, page = 1, sort = [];
        for (const [k, v] of url.searchParams) {
          if (k === '_limit') { limit = Math.max(1, Math.min(MAX_ROWS, parseInt(v, 10) || MAX_ROWS)); continue; }
          if (k === '_page') { page = Math.max(1, parseInt(v, 10) || 1); continue; }
          if (k === '_sort') { sort = v.split(',').filter(Boolean); continue; }
          if (k === '_order') { if (sort.length) sort = sort.map((s, i) => (i === 0 && /desc/i.test(v) && s[0] !== '-' ? '-' + s : s)); continue; }
          if (k === 'q') {
            const textCols = t.columns.filter((c) => c.text && !t.hidden.has(c.name));
            if (!textCols.length) continue;
            const safeV = String(v).replace(/[%_]/g, '');
            const like = db.kind === 'postgres' ? (c) => `CAST(${db.q(c.name)} AS TEXT) ILIKE ?` : (c) => `${db.q(c.name)} LIKE ?`;
            where.push('(' + textCols.map(like).join(' OR ') + ')');
            textCols.forEach(() => params.push('%' + safeV + '%'));
            continue;
          }
          const m = k.match(/^(.+?)(?:_(gte|lte|gt|lt|ne|like))?$/);
          const col = t.cols.has(k) ? k : m && t.cols.has(m[1]) ? m[1] : null;
          if (!col || t.hidden.has(col)) continue; // unknown filters are ignored, like json-server
          const op = col === k ? 'eq' : m[2];
          const c = db.q(col);
          const val = t.cols.get(col).bool ? (v === 'true' || v === '1' ? 1 : v === 'false' || v === '0' ? 0 : v) : v;
          const bval = db.kind === 'postgres' && t.cols.get(col).bool ? !!val : val;
          if (op === 'eq') {
            const many = url.searchParams.getAll(k);
            if (many.length > 1) { if (many.indexOf(v) === 0) { where.push(`${c} IN (${many.map(() => '?').join(', ')})`); params.push(...many); } }
            else { where.push(`${c} = ?`); params.push(bval); }
          } else if (op === 'like') { where.push(db.kind === 'postgres' ? `CAST(${c} AS TEXT) ILIKE ?` : `${c} LIKE ?`); params.push('%' + String(v).replace(/[%_]/g, '') + '%'); }
          else { where.push(`${c} ${{ gte: '>=', lte: '<=', gt: '>', lt: '<', ne: '<>' }[op]} ?`); params.push(bval); }
        }
        const order = sort.map((s) => {
          const desc = s[0] === '-';
          const col = desc ? s.slice(1) : s;
          // a hidden column can't be read, so it can't be sorted by either (the order would give its values away)
          return t.cols.has(col) && !t.hidden.has(col) ? `${db.q(col)} ${desc ? 'DESC' : 'ASC'}` : null;
        }).filter(Boolean);
        if (!order.length && t.key) order.push(`${db.q(t.key)} ASC`);
        const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
        const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM ${db.q(t.name)}${w}`, params);
        const rows = await db.query(`SELECT * FROM ${db.q(t.name)}${w}${order.length ? ' ORDER BY ' + order.join(', ') : ''} LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params);
        return send(res, 200, rows.map((r) => clean(t, r)), { 'X-Total-Count': String(Number(n)), 'Access-Control-Expose-Headers': 'X-Total-Count' });
      }

      if (method === 'POST' && !id) {
        if (!t.can.create) return send(res, 403, { message: `New ${name} can't be added here.` });
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { message: 'Send a JSON object.' });
        const { data, errors } = pick(t, body, 'create');
        if (Object.keys(errors).length) return send(res, 422, invalid(errors));
        const keys = Object.keys(data);
        const cols = keys.length ? `(${keys.map(db.q).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})` : db.kind === 'mysql' ? '() VALUES ()' : 'DEFAULT VALUES';
        const sql = `INSERT INTO ${db.q(t.name)} ${cols}`;
        let row;
        if (db.kind === 'mysql') {
          const r = await db.run(sql, Object.values(data));
          const key = t.key && (data[t.key] !== undefined ? data[t.key] : r.insertId);
          row = t.key && key != null ? await one(t, key) : data;
        } else row = (await db.query(sql + ' RETURNING *', Object.values(data)))[0];
        return send(res, 201, clean(t, row));
      }

      if (!id) return send(res, 405, { message: `${method} needs an id: ${prefix}/${name}/1` });
      if (!t.key) return send(res, 404, { message: `${name} has no single primary key, so rows can't be addressed by id.` });

      if (method === 'GET') {
        if (!t.can.read) return send(res, 403, { message: `${name} can't be read.` });
        const row = await one(t, id);
        return row ? send(res, 200, clean(t, row)) : send(res, 404, { message: `No ${name} with ${t.key} ${id}.` });
      }
      if (method === 'DELETE') {
        if (!t.can.delete) return send(res, 403, { message: `${name} can't be deleted here.` });
        const r = await db.run(`DELETE FROM ${db.q(t.name)} WHERE ${db.q(t.key)} = ?`, [id]);
        return r.changes ? send(res, 204) : send(res, 404, { message: `No ${name} with ${t.key} ${id}.` });
      }
      if (method === 'PUT' || method === 'PATCH') {
        if (!t.can.update) return send(res, 403, { message: `${name} can't be changed here.` });
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { message: 'Send a JSON object.' });
        const { data, errors } = pick(t, body, method === 'PUT' ? 'put' : 'patch');
        if (Object.keys(errors).length) return send(res, 422, invalid(errors));
        const keys = Object.keys(data);
        if (!keys.length) {
          const row = await one(t, id);
          return row ? send(res, 200, clean(t, row)) : send(res, 404, { message: `No ${name} with ${t.key} ${id}.` });
        }
        const sql = `UPDATE ${db.q(t.name)} SET ${keys.map((k) => `${db.q(k)} = ?`).join(', ')} WHERE ${db.q(t.key)} = ?`;
        let row;
        if (db.kind === 'mysql') {
          const before = await one(t, id);
          if (!before) return send(res, 404, { message: `No ${name} with ${t.key} ${id}.` });
          await db.run(sql, [...Object.values(data), id]);
          row = await one(t, id);
        } else row = (await db.query(sql + ' RETURNING *', [...Object.values(data), id]))[0];
        return row ? send(res, 200, clean(t, row)) : send(res, 404, { message: `No ${name} with ${t.key} ${id}.` });
      }
      return send(res, 405, { message: `${method} is not supported.` });
    } catch (e) {
      if (e.status === 413) return send(res, 413, { message: e.message });
      const refused = dbError(e);
      if (refused) return send(res, 422, refused);
      log.error(`  Database error on ${method} ${urlPath}: ${e.message}`);
      return send(res, 500, { message: isProd ? 'Server error.' : e.message });
    }
  }
  handler.refresh = () => { schema = null; };
  handler.tables = async () => [...(await tables()).keys()];
  return handler;
}

module.exports = { createDbApi };
