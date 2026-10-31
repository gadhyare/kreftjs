/*
 * Events and listeners system.
 *
 *   // app/Events/OrderShipped.js
 *   class OrderShipped { constructor(order) { this.order = order } }
 *
 *   // app/Listeners/SendShipmentNotice.js — found by itself
 *   class SendShipmentNotice {
 *     static event = 'OrderShipped'        // the event's class name (or the class, or a list)
 *     static queue = true                  // optional: run it later, on the queue
 *     async handle(event) { await Mail.to(event.order.email).send(new ShipmentMail(event.order)) }
 *   }
 *
 *   await event(new OrderShipped(order))      or   Event.dispatch('user.login', user)
 *   Event.listen('user.login', (user) => Log.info('login', { id: user.id }))
 */
const listeners = new Map(); // event name → [listener]
const nameOf = (e) => (typeof e === 'string' ? e : typeof e === 'function' ? e.name : e && e.constructor ? e.constructor.name : String(e));

const Event = {
  listen(event, listener) {
    for (const ev of [].concat(event)) {
      const key = nameOf(ev);
      if (!listeners.has(key)) listeners.set(key, []);
      listeners.get(key).push(listener);
    }
  },
  hasListeners: (event) => (listeners.get(nameOf(event)) || []).length > 0,
  forget(event) { listeners.delete(nameOf(event)); },
  reset() { listeners.clear(); },
  // runs every listener (queued ones go to the queue); a listener that returns false stops the rest
  async dispatch(event, ...payload) {
    const list = listeners.get(nameOf(event)) || [];
    const results = [];
    for (const L of list) {
      let r;
      if (typeof L === 'function' && !/^class\s/.test(Function.prototype.toString.call(L))) r = await L(event, ...payload);
      else if (typeof L === 'function' && L.queue) { await require('./queue.js').push('listener', L.name, { event: typeof event === 'object' ? { class: event.constructor.name, data: { ...event } } : event, payload }, { queue: typeof L.queue === 'string' ? L.queue : undefined }); continue; }
      else { const inst = typeof L === 'function' ? new L() : L; r = await inst.handle(event, ...payload); }
      results.push(r);
      if (r === false) break;
    }
    return results;
  },
  listeners: () => [...listeners].map(([event, list]) => ({ event, listeners: list.map((l) => l.name || 'Closure') })),
};
const event = (e, ...payload) => Event.dispatch(e, ...payload);

module.exports = { Event, event, nameOf };
