// JSON and objects from requests: drop keys that could change object prototype behavior
// ("__proto__", "constructor", "prototype") to prevent prototype pollution.
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const isBadKey = (k) => BAD.has(String(k)) || /^(?:__proto__|constructor|prototype)(?:\.|$)/.test(String(k));
const parseJson = (text) => JSON.parse(text, (key, value) => (BAD.has(key) ? undefined : value));
function safeObjectFromEntries(entries) {
  const out = {};
  for (const [k, v] of entries) {
    if (!isBadKey(k)) out[k] = v;
  }
  return out;
}
function cleanObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanObject);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!isBadKey(k)) out[k] = v && typeof v === 'object' ? cleanObject(v) : v;
  }
  return out;
}

module.exports = { parseJson, BAD, isBadKey, safeObjectFromEntries, cleanObject };

