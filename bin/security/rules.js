'use strict';
/*
 * Package rules: the developer's remembered decisions about npm packages.
 *
 *   security.allowedPackages   packages the developer allowed for good: the "Allow / Disallow" question is not asked again
 *   security.deniedPackages    packages the developer disallowed for good: they are blocked
 *
 * An entry is a package name ("lodash", "@scope/pkg") for any version, or an exact version ("lodash@4.17.21").
 * Allowing a package NEVER lets it past a security finding: the review (integrity, advisories, license, tier) runs first and
 * a package that fails it stays blocked. An allowed package only skips the question.
 *
 * The rules live in kreftjs.config.json. They are edited as the raw JSON of that file, so "${NAME}" placeholders and every
 * other setting stay exactly as they were written.
 */
const fs = require('fs');
const path = require('path');

const NAME = '(?:@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*';
const RULE = new RegExp(`^(${NAME})(?:@(\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.+-]*)?))?$`);

function parseRule(raw) {
  const text = String(raw);
  const m = text.length <= 260 ? RULE.exec(text) : null;
  if (!m) throw Error(`"${text.slice(0, 80)}" is not a package rule. Use a registry name like lodash or @scope/pkg, or an exact version like lodash@4.17.21 (not a range, tag or URL).`);
  return { name: m[1], version: m[2] || null, text: m[2] ? `${m[1]}@${m[2]}` : m[1] };
}

// does one rule entry cover this package at this version?
function covers(entry, name, version) {
  const r = parseRule(entry);
  return r.name === name && (r.version === null || r.version === version);
}

const listCovers = (list, name, version) => list.some((e) => covers(e, name, version));

// two lists that name the same package, with versions that overlap, contradict each other
function conflict(allowed, denied) {
  for (const a of allowed) for (const d of denied) {
    const x = parseRule(a), y = parseRule(d);
    if (x.name === y.name && (x.version === null || y.version === null || x.version === y.version)) return [a, d];
  }
  return null;
}

// the requested packages with the exact version the review resolved them to
function requestedNodes(report) {
  return (report.requested || []).map((r) => {
    const node = (report.packages || []).find((n) => n.location === `node_modules/${r.name}`);
    return { name: r.name, version: node ? node.version : null };
  });
}

// All requested packages are on the allow list (and none is denied): returns their names, otherwise null.
// This only skips the question. The review has already passed, or the installation would have stopped before this point.
function preapproved(p, report) {
  const nodes = requestedNodes(report);
  if (!nodes.length || !p.allowedPackages || !p.allowedPackages.length) return null;
  const ok = nodes.every((n) => n.version && listCovers(p.allowedPackages, n.name, n.version) && !listCovers(p.deniedPackages, n.name, n.version));
  return ok ? nodes.map((n) => `${n.name}@${n.version}`) : null;
}

function configPath(project) {
  const found = require('../kreftjs-config.js').readConfig(project);
  return found.file || path.join(path.resolve(project), 'kreftjs.config.json');
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Reads the file as it is on disk (no "${NAME}" replaced), so what is written back is what was written there.
function readRaw(file) {
  if (!fs.existsSync(file)) return { raw: {}, existed: false };
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw Error(`${file} is not valid JSON: ${e.message}`); }
  if (!isObj(raw)) throw Error(`${file} must contain a JSON object`);
  return { raw, existed: true };
}

const uniq = (list) => [...new Set(list)];

// ops: { allow: [rule…], deny: [rule…], forget: [rule…] }. Returns { file, allowed, denied, notes }.
function editRules(project, ops = {}) {
  const { policy } = require('./policy.js');
  const file = configPath(project);
  const { raw } = readRaw(file);
  const sec = raw.security === undefined ? {} : raw.security;
  if (!isObj(sec)) throw Error('security in kreftjs.config.json must be an object');
  let allowed = [...(sec.allowedPackages || [])], denied = [...(sec.deniedPackages || [])];
  const notes = [];

  for (const r of (ops.forget || []).map(parseRule)) {
    const drop = (list) => list.filter((e) => { const x = parseRule(e); return r.version ? x.text !== r.text : x.name !== r.name; });
    const before = allowed.length + denied.length;
    allowed = drop(allowed); denied = drop(denied);
    if (allowed.length + denied.length === before) notes.push(`${r.text} had no rule`);
  }
  for (const r of (ops.allow || []).map(parseRule)) {
    // an explicit allow replaces a deny of the same package: the developer changed their mind on purpose
    const gone = denied.filter((e) => { const x = parseRule(e); return x.name === r.name && (x.version === null || r.version === null || x.version === r.version); });
    if (gone.length) { denied = denied.filter((e) => !gone.includes(e)); notes.push(`${r.text} was denied (${gone.join(', ')}): that rule is removed`); }
    allowed.push(r.text);
  }
  for (const r of (ops.deny || []).map(parseRule)) {
    const gone = allowed.filter((e) => { const x = parseRule(e); return x.name === r.name && (x.version === null || r.version === null || x.version === r.version); });
    if (gone.length) { allowed = allowed.filter((e) => !gone.includes(e)); notes.push(`${r.text} was allowed (${gone.join(', ')}): that rule is removed`); }
    denied.push(r.text);
  }
  allowed = uniq(allowed); denied = uniq(denied);

  const next = { ...sec };
  if (allowed.length || 'allowedPackages' in sec) next.allowedPackages = allowed;
  if (denied.length || 'deniedPackages' in sec) next.deniedPackages = denied;
  policy(next); // the same checks the installer makes: a file this writes is a file the installer accepts
  raw.security = next;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o644;
  fs.writeFileSync(tmp, JSON.stringify(raw, null, 2) + '\n', { mode });
  fs.renameSync(tmp, file);
  return { file, allowed, denied, notes };
}

// the prompt's "Always allow" and "Never allow": allow records the exact version reviewed, deny records the name
function remember(project, report, kind) {
  const nodes = requestedNodes(report);
  if (!nodes.length) throw Error('there is no requested package to remember');
  const entries = nodes.map((n) => (kind === 'allow' ? (n.version ? `${n.name}@${n.version}` : n.name) : n.name));
  const r = editRules(project, kind === 'allow' ? { allow: entries } : { deny: entries });
  return { kind, entries, file: r.file };
}

function listRules(project) {
  const file = configPath(project);
  const { raw, existed } = readRaw(file);
  const sec = isObj(raw.security) ? raw.security : {};
  return { file: existed ? file : null, allowed: [...(sec.allowedPackages || [])], denied: [...(sec.deniedPackages || [])] };
}

module.exports = { parseRule, covers, listCovers, conflict, preapproved, requestedNodes, editRules, remember, listRules, configPath };
