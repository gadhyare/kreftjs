/*
 * SEO for pages that come from your data, answered by the server (so crawlers that do not run JavaScript see it).
 *
 *   backend/routes/seo.js
 *
 *   const Post = require('../app/Models/Post')
 *
 *   module.exports = {
 *     '/': { title: 'My shop', description: 'Everything for the home' },
 *     '/posts/:slug': async ({ slug }) => {
 *       const post = await Post.where('slug', slug).first()
 *       if (!post) return null                       // answered as 404 (and noindex)
 *       return { title: post.title, description: post.excerpt, og: { image: post.image }, schema: { '@type': 'Article', headline: post.title } }
 *     },
 *     // the addresses of your data pages, for `kreftjs sitemap`: '/path' or { path, lastmod }
 *     urls: async () => (await Post.all()).map((p) => ({ path: '/posts/' + p.slug, lastmod: p.updated_at })),
 *   }
 *
 * Every page request the server answers with index.html gets the tags of the first matching pattern.
 * The tags carry data-kreft-ssr: the browser keeps them until the first navigation.
 */
const fs = require('fs');
const path = require('path');
const { SEO } = require('./support.js');

const cache = new Map(); // file → { mtime, rules }

function loadRules(backendDir) {
  const { findFile } = require('./typescript.js');
  const file = findFile(path.join(backendDir, 'routes', 'seo'));
  if (!file) return null;
  const mtime = fs.statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.rules;
  delete require.cache[require.resolve(file)];
  let rules = require(file);
  if (rules && rules.default) rules = rules.default;
  if (typeof rules === 'function') rules = rules();
  cache.set(file, { mtime, rules: rules || {} });
  return rules || {};
}

// '/posts/:slug' matches '/posts/hello' (slug = 'hello'); a trailing '/*' matches anything below
function matchPath(pattern, urlPath) {
  const want = pattern.split('/').filter(Boolean);
  const have = urlPath.split('/').filter(Boolean);
  const params = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i] === '*') return params;
    if (i >= have.length) return null;
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(have[i]);
    else if (want[i] !== have[i]) return null;
  }
  return want.length === have.length ? params : null;
}

// the tags for a page path, or null when seo.js has nothing for it: { status, tags, title }
async function resolve(backendDir, urlPath, req) {
  const rules = loadRules(backendDir);
  if (!rules) return null;
  for (const pattern of Object.keys(rules)) {
    if (!pattern.startsWith('/')) continue;
    let params;
    try { params = matchPath(pattern, urlPath); } catch (_) { params = null; } // a bad %-escape in the address
    if (!params) continue;
    const rule = rules[pattern];
    let data = typeof rule === 'function' ? await rule(params, req) : rule;
    if (data === null || data === false || (data && data.status === 404)) {
      return { status: 404, tags: SEO.renderTags({ title: (data && data.title) || 'Not found', robots: 'noindex' }) };
    }
    data = { ...(data || {}) };
    const site = (process.env.APP_URL || '').replace(/\/+$/, '');
    if (!data.canonical && site) data.canonical = site + (urlPath === '/' ? '/' : urlPath.replace(/\/+$/, ''));
    return { status: 200, tags: SEO.renderTags(data) };
  }
  return null;
}

// puts tags into <head>, taking the page's own copy of each out
function inject(html, tags) {
  const keys = new Set([...tags.matchAll(/<meta\s+(?:name|property)="([^"]*)"/g)].map((m) => m[1]));
  const marked = tags.replace(/<(meta|link|script)\b/g, '<$1 data-kreft-seo="" data-kreft-ssr=""');
  let out = html;
  if (tags.includes('<title>')) out = out.replace(/<title[^>]*>[\s\S]*?<\/title>\s*/i, '');
  out = out.replace(/<meta\s[^>]*>\s*/gi, (m) => {
    const key = (m.match(/\b(?:name|property)\s*=\s*["']([^"']*)["']/i) || [])[1];
    return key && keys.has(key) ? '' : m;
  });
  if (tags.includes('rel="canonical"')) out = out.replace(/<link\s[^>]*rel\s*=\s*["']canonical["'][^>]*>\s*/gi, '');
  return /<\/head>/i.test(out) ? out.replace(/<\/head>/i, () => marked + '\n</head>') : marked + '\n' + out;
}

// the addresses seo.js lists for the sitemap
async function urls(backendDir) {
  const rules = loadRules(backendDir);
  if (!rules || typeof rules.urls !== 'function') return [];
  return (await rules.urls()) || [];
}

module.exports = { resolve, inject, urls, matchPath, loadRules };
