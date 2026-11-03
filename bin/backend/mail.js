/*
 * Mail and mailable classes.
 *
 *   // app/Mail/WelcomeMail.js
 *   const { Mailable } = require('kreft/server')
 *   class WelcomeMail extends Mailable {
 *     constructor(user) { super(); this.user = user }
 *     build() {
 *       return this.subject('Welcome!')
 *         .text(`Hello ${this.user.name}, thanks for joining.`)
 *         .html(`<p>Hello <b>${this.user.name}</b>, thanks for joining.</p>`)   // optional
 *     }
 *   }
 *
 *   await Mail.to(user.email).send(new WelcomeMail(user))
 *   await Mail.to(user).queue(new WelcomeMail(user))        // later, on the queue
 *   await Mail.to('a@x.com').cc('b@x.com').later(60, new WelcomeMail(user))
 *   await Mail.send({ to, subject, text })                  // without a class
 */
const support = require('./support.js');

const cleanHeader = (s) => String(s ?? '').replace(/[\r\n\0]+/g, ' ').trim();
const cleanDisplayName = (s) => cleanHeader(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const cleanEmailAddr = (s) => cleanHeader(s).replace(/[<>"]/g, '');

class Mailable {
  constructor() { Object.defineProperty(this, '__mail', { value: { attachments: [] }, writable: true, enumerable: false }); }
  _m() { if (!this.__mail) Object.defineProperty(this, '__mail', { value: { attachments: [] }, writable: true, enumerable: false }); return this.__mail; }
  subject(s) { this._m().subject = cleanHeader(s); return this; }
  from(address, name) { this._m().from = name ? `"${cleanDisplayName(name)}" <${cleanEmailAddr(address)}>` : cleanHeader(address); return this; }
  replyTo(address) { this._m().replyTo = cleanHeader(address); return this; }
  text(t) { this._m().text = t; return this; }
  html(h) { this._m().html = h; return this; }
  // a simple, good-looking email from lines: greeting, lines, a button, a closing line
  markdown({ greeting, lines = [], action, outro = [], salutation } = {}) {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const safeUrl = (u) => {
      const str = String(u ?? '').trim();
      return /^(?:javascript|vbscript|data):/i.test(str.replace(/[\u0000-\u0020]+/g, '')) ? '#' : esc(str);
    };
    const name = process.env.APP_NAME || 'App';
    const text = [greeting, '', ...lines, ...(action ? ['', `${action.text}: ${action.url}`] : []), ...(outro.length ? ['', ...outro] : []), '', salutation || `Regards,\n${name}`].filter((x) => x !== undefined).join('\n');
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#09090b">
${greeting ? `<h1 style="font-size:20px">${esc(greeting)}</h1>` : ''}${lines.map((l) => `<p style="line-height:1.6">${esc(l)}</p>`).join('')}
${action ? `<p style="margin:24px 0"><a href="${safeUrl(action.url)}" style="background:#18181b;color:#fafafa;padding:10px 18px;text-decoration:none;display:inline-block">${esc(action.text)}</a></p>` : ''}
${outro.map((l) => `<p style="line-height:1.6">${esc(l)}</p>`).join('')}<p style="color:#71717a">${esc(salutation || 'Regards,')}<br>${salutation ? '' : esc(name)}</p></div>`;
    return this.text(text).html(html);
  }
  attach(file, { as, mime } = {}) { this._m().attachments.push(typeof file === 'string' ? { path: file, filename: as, contentType: mime } : file); return this; }
  build() { return this; }
  async render() { await this.build(); const m = this._m(); return { subject: cleanHeader(m.subject || this.constructor.name.replace(/Mail$/, '')), text: m.text || '', html: m.html, from: m.from, replyTo: m.replyTo, attachments: m.attachments }; }
}

const address = (to) => [].concat(to).filter(Boolean).map((x) => (typeof x === 'string' ? cleanHeader(x) : x.name ? `"${cleanDisplayName(x.name)}" <${cleanEmailAddr(x.email)}>` : cleanEmailAddr(x.email))).join(', ');

class PendingMail {
  constructor(to) { this._to = to; this._cc = []; this._bcc = []; }
  cc(a) { this._cc = [].concat(a); return this; }
  bcc(a) { this._bcc = [].concat(a); return this; }
  async send(mailable) {
    const r = await mailable.render();
    return support.Mail.send({ ...r, to: address(this._to), cc: address(this._cc) || undefined, bcc: address(this._bcc) || undefined });
  }
  async queue(mailable, { delay = 0, queue } = {}) {
    const app = require('./app.js');
    if (!app.find(mailable.constructor.name, 'mail')) return this.send(mailable);
    const plain = (x) => [].concat(x).map((v) => (typeof v === 'string' ? v : { email: v.email, name: v.name }));
    return require('./queue.js').push('mail', mailable.constructor.name, { to: plain(this._to), cc: plain(this._cc), bcc: plain(this._bcc), mailable: { ...mailable } }, { delay, queue });
  }
  later(seconds, mailable) { return this.queue(mailable, { delay: seconds }); }
}

// Mail.to(…) and the older Mail.send({ … })
const Mail = support.Mail;
Mail.to = (to) => new PendingMail(to);

module.exports = { Mail, Mailable, PendingMail };
