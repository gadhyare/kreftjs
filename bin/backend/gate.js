/*
 * Gates and policies: authorization and permissions.
 *
 *   Gate.define('edit-settings', (user) => user.is_admin)
 *   // app/Policies/PostPolicy.js — found by itself for the Post model
 *   class PostPolicy {
 *     before(user) { if (user.is_admin) return true }      // optional: say yes (or no) to everything first
 *     view(user, post) { return true }
 *     update(user, post) { return post.user_id === user.id }
 *     delete(user, post) { return post.user_id === user.id }
 *     create(user) { return user.email_verified_at != null }
 *   }
 *
 *   await req.authorize('update', post)          // 403 when not allowed
 *   if (await req.can('delete', post)) { … }
 *   Route.put('/posts/{post}', …).middleware('can:update,post')
 *   await Gate.forUser(user).allows('create', Post)
 */
const path = require('path');
const gates = new Map();
let policyFiles = new Map(); // model name → file

const unwrap = (m) => (m && m.default ? m.default : m);
const modelName = (target) => (typeof target === 'function' ? target.name : target && target.constructor ? target.constructor.name : null);

function hasPolicyMethod(policy, method) {
  if (!policy || typeof method !== 'string' || !method) return false;
  if (method === 'constructor' || method === '__proto__' || method === 'prototype') return false;
  if (Object.prototype.hasOwnProperty.call(policy, method) && typeof policy[method] === 'function') return true;
  let proto = Object.getPrototypeOf(policy);
  while (proto && proto !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(proto, method) && typeof policy[method] === 'function') return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

async function check(user, ability, args) {
  if (!ability || typeof ability !== 'string' || ability === 'constructor' || ability === '__proto__' || ability === 'prototype') {
    return false;
  }
  const target = args[0];
  const name = target != null && typeof target !== 'string' ? modelName(target) : null;
  const file = name && policyFiles.get(name);
  if (file) {
    const Policy = typeof file === 'string' ? unwrap(require(file)) : file;
    const policy = typeof Policy === 'function' ? new Policy() : Policy;
    if (hasPolicyMethod(policy, 'before') && (user != null || policy.before.allowGuest)) {
      const b = await policy.before(user, ability, ...args);
      if (b === true || b === false) return b;
    }
    if (hasPolicyMethod(policy, ability)) {
      if (user == null && !policy[ability].allowGuest) return false;
      return Boolean(await policy[ability](user, ...(typeof target === 'function' ? args.slice(1) : args)));
    }
  }
  const fn = gates.get(ability);
  if (fn) return user != null || fn.allowGuest ? Boolean(await fn(user, ...args)) : false;
  return false; // nothing says yes: no
}

const Gate = {
  define(ability, fn) { gates.set(ability, fn); },
  policy(ModelOrName, Policy) { policyFiles.set(typeof ModelOrName === 'string' ? ModelOrName : ModelOrName.name, Policy); },
  policyFile(name, file) { policyFiles.set(name, file); },
  resetPolicies() { policyFiles = new Map(); },
  has: (ability) => gates.has(ability),
  forUser(user) {
    return {
      allows: (ability, ...args) => check(user, ability, args),
      denies: async (ability, ...args) => !(await check(user, ability, args)),
      authorize: async (ability, ...args) => { if (!(await check(user, ability, args))) { const { HttpError } = require('./http.js'); throw new HttpError(403, 'This action is unauthorized.'); } return true; },
    };
  },
  abilities: () => [...gates.keys()],
  policies: () => [...policyFiles.keys()].map((k) => ({ model: k, policy: typeof policyFiles.get(k) === 'string' ? path.basename(policyFiles.get(k)) : policyFiles.get(k).name })),
};

module.exports = { Gate, check };
