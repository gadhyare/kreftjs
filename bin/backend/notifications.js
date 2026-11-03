/*
 * Notifications: delivery across multiple channels (mail, database).
 *
 *   // app/Notifications/InvoicePaid.js
 *   const { Notification } = require('kreftjs/server')
 *   class InvoicePaid extends Notification {
 *     static queue = true                                   // optional: send it later, on the queue
 *     constructor(invoice) { super(); this.invoice = invoice }
 *     via(user) { return ['mail', 'database'] }
 *     toMail(user) {
 *       return { subject: 'Invoice paid', greeting: `Hello ${user.name}`, lines: ['We received your payment.'],
 *                action: { text: 'View invoice', url: Url.to('/invoices/' + this.invoice.id) } }
 *     }
 *     toDatabase(user) { return { invoice_id: this.invoice.id, amount: this.invoice.amount } }
 *   }
 *
 *   await user.notify(new InvoicePaid(invoice))
 *   await Notification.send(users, new InvoicePaid(invoice))
 *   const list = await user.notifications().get()           // the notifications table (kreft notifications:table)
 *   await user.unreadNotifications().update({ read_at: new Date() })
 */
const crypto = require('crypto');
const { Builder } = require('./query.js');

class Notification {
  via() { return ['mail']; }
}

async function sendNow(notifiables, notification, channels) {
  const { Mailable, Mail } = require('./mail.js');
  for (const n of [].concat(notifiables)) {
    const via = channels || [].concat(await notification.via(n));
    for (const channel of via) {
      if (channel === 'mail') {
        if (typeof notification.toMail !== 'function') throw new Error(`${notification.constructor.name} has no toMail(notifiable).`);
        let mail = await notification.toMail(n);
        if (!(mail instanceof Mailable)) {
          const data = mail;
          mail = new Mailable().subject(data.subject || notification.constructor.name);
          if (data.text || data.html) { if (data.text) mail.text(data.text); if (data.html) mail.html(data.html); }
          else mail.markdown(data);
        }
        const to = typeof n.routeNotificationForMail === 'function' ? await n.routeNotificationForMail(notification) : n.email;
        if (to) await Mail.to(to).send(mail);
      } else if (channel === 'database') {
        const data = typeof notification.toDatabase === 'function' ? await notification.toDatabase(n) : typeof notification.toArray === 'function' ? await notification.toArray(n) : {};
        const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await new Builder('notifications').insert({ id: crypto.randomUUID(), type: notification.constructor.name, notifiable_type: n.constructor.name, notifiable_id: n[n.constructor.primaryKey], data: JSON.stringify(data), read_at: null, created_at: ts, updated_at: ts });
      } else if (typeof channel === 'function' || (channel && typeof channel.send === 'function')) {
        await (typeof channel === 'function' ? new channel() : channel).send(n, notification); // your own channel: { send(notifiable, notification) }
      } else throw new Error(`Unknown notification channel "${channel}".`);
    }
  }
}

Notification.send = async function (notifiables, notification) {
  const C = notification.constructor;
  if (C.queue && require('./app.js').find(C.name, 'notification')) {
    for (const n of [].concat(notifiables)) {
      await require('./queue.js').push('notification', C.name, { notifiable: n, notification: { ...notification }, channels: null }, { queue: typeof C.queue === 'string' ? C.queue : undefined });
    }
    return;
  }
  return sendNow(notifiables, notification);
};
Notification.sendNow = sendNow;

module.exports = { Notification, sendNow };
