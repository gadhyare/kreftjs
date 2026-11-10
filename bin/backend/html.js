/*
 * Kreft HTML Security & Sanitization Engine: cleanHtml, escapeHtml, stripTags, SafeHtml
 *
 * Provides enterprise-grade, zero-dependency HTML sanitization, tag stripping,
 * entity escaping, and SafeHtml wrapper objects.
 *
 * Capabilities:
 *   1. cleanHtml(html, options) / sanitizeHtml(html, options):
 *      Strips malicious scripts, dangerous event handlers (onerror, onload, onclick),
 *      and unsafe URI schemes (javascript:, vbscript:, data:text/html) while preserving
 *      safe semantic formatting (p, b, strong, a, code, pre, img, tables, lists).
 *
 *   2. stripTags(html):
 *      Removes all HTML tags and returns clean plain text.
 *
 *   3. escapeHtml(str) / e(str):
 *      Escapes dangerous characters (&, <, >, ", ') into safe HTML entities.
 *
 *   4. SafeHtml / html`...`:
 *      Wraps trusted or sanitized HTML so it can be passed safely to views and templates.
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const UNESCAPE_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&colon;': ':',
  '&tab;': '\t',
  '&newline;': '\n',
};

// Default allowed HTML tags for rich content
const DEFAULT_ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'small', 'mark', 'sub', 'sup',
  'blockquote', 'pre', 'code', 'kbd', 'q',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'div', 'span', 'figure', 'figcaption', 'picture',
  'a', 'img'
]);

// Default allowed attributes per tag
const DEFAULT_ALLOWED_ATTRS = {
  '*': ['id', 'class', 'title', 'dir', 'lang'],
  a: ['href', 'target', 'rel', 'download', 'name'],
  img: ['src', 'alt', 'width', 'height', 'loading', 'decoding', 'title'],
  table: ['border', 'cellpadding', 'cellspacing', 'summary'],
  th: ['colspan', 'rowspan', 'scope', 'align', 'valign'],
  td: ['colspan', 'rowspan', 'align', 'valign'],
  pre: ['data-lang'],
  code: ['data-lang'],
};

// Safe URI schemes for href and src
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:', '#', '/'];

// Safe style properties (prevents CSS injection & expression())
const SAFE_STYLE_PROPS = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family',
  'text-align', 'text-decoration', 'line-height', 'letter-spacing',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-radius', 'border-color', 'border-width', 'border-style',
  'width', 'max-width', 'height', 'max-height', 'display', 'opacity', 'gap'
]);

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

function unescapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isNaN(code) ? '' : String.fromCodePoint(Math.min(code, 0x10ffff));
    })
    .replace(/&#(\d+);?/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isNaN(code) ? '' : String.fromCodePoint(Math.min(code, 0x10ffff));
    })
    .replace(/&(?:amp|lt|gt|quot|#39|#039|apos|nbsp|colon|tab|newline);/gi, (c) => UNESCAPE_MAP[c.toLowerCase()] || c);
}

function stripTags(html) {
  if (html == null) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSafeUrl(url) {
  if (!url) return false;
  // Decode HTML entities (including numeric/hex entities) and strip control/whitespace characters to prevent scheme evasion
  const decoded = unescapeHtml(String(url)).trim().replace(/[\x00-\x20\s]/g, '');
  if (!decoded) return false;
  if (/^(?:javascript|vbscript|data|file|blob):/i.test(decoded)) {
    // Only allow safe static raster images in base64 data URIs (svg is blocked because it can execute script)
    if (/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(decoded)) {
      return true;
    }
    return false;
  }
  const schemeMatch = decoded.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/);
  if (schemeMatch && !SAFE_SCHEMES.includes(schemeMatch[1].toLowerCase())) {
    return false;
  }
  return true;
}

function cleanStyle(styleValue) {
  if (!styleValue || typeof styleValue !== 'string') return '';
  const rules = styleValue.split(';');
  const cleanRules = [];

  for (const rule of rules) {
    const colonIdx = rule.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = rule.slice(0, colonIdx).trim().toLowerCase();
    const val = rule.slice(colonIdx + 1).trim();

    // Block expression(), javascript:, url(...), behavior, @import
    if (/expression|javascript|behavior|import|url\s*\(/i.test(val)) continue;

    if (SAFE_STYLE_PROPS.has(prop)) {
      cleanRules.push(`${prop}: ${val}`);
    }
  }

  return cleanRules.join('; ');
}

function cleanHtml(rawHtml, options = {}) {
  if (rawHtml == null) return '';
  let html = String(rawHtml);

  const allowedTags = options.allowedTags ? new Set(options.allowedTags.map((t) => t.toLowerCase())) : DEFAULT_ALLOWED_TAGS;
  const allowedAttrs = options.allowedAttributes || DEFAULT_ALLOWED_ATTRS;
  const allowStyle = options.allowStyle !== false;

  // 1. Unconditionally strip active execution tags (loop to prevent nested tag bypasses)
  // Every pattern below is only run on the part of the text where it can still match (up to the last ">" , the last closing tag…).
  // A "<" after that point has nothing that could close it, and trying it anyway makes the work grow with the square of the length.
  let prev;
  const BLOCK_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'form', 'svg', 'math', 'noscript', 'template'];
  const dangerousTagRegex = /<\/?(?:script|style|iframe|object|embed|applet|form|base|meta|link|svg|math|noscript|template)\b[^>]*>/gi;
  const upTo = (text, last, re, repl) => {   // run re only on text[0 .. last], leave the rest as it is
    if (last < 0) return text;
    return text.slice(0, last).replace(re, repl) + text.slice(last);
  };
  do {
    prev = html;
    for (const name of BLOCK_TAGS) {
      const lower = html.toLowerCase();
      const close = lower.lastIndexOf('</' + name);
      if (close < 0) continue;
      const end = html.indexOf('>', close) + 1;
      html = upTo(html, end, new RegExp(`<${name}[\\s\\S]*?<\\/${name}>`, 'gi'), '');
    }
    html = upTo(html, html.lastIndexOf('>') + 1, dangerousTagRegex, '');
    const endComment = html.lastIndexOf('-->');
    html = upTo(html, endComment < 0 ? -1 : endComment + 3, /<!--[\s\S]*?-->/g, '');
  } while (html !== prev);

  // 2. Parse and sanitize all tags and attributes
  // The three parts of the attribute text cannot start with the same character, so there is only one way to read it (no backtracking).
  // (a quote that never closes counts as an ordinary character, so a tag is always read up to its ">")
  const tagRegex = /<\/?([a-zA-Z0-9:-]+)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*'|["'])*?)\s*(\/?)>/g;

  const lastGt = html.lastIndexOf('>') + 1;
  const tail = html.slice(lastGt);   // after the last ">" no tag can end
  html = html.slice(0, lastGt).replace(tagRegex, (match, tagName, rawAttrs, selfClose) => {
    const tag = tagName.toLowerCase();

    // If tag is not allowed, strip it
    if (!allowedTags.has(tag)) {
      return options.stripDisallowed ? '' : escapeHtml(match);
    }

    // Check if it's a closing tag
    if (match.startsWith('</')) {
      return `</${tag}>`;
    }

    // Parse attributes
    const attrRegex = /([a-zA-Z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let attrMatch;
    const cleanAttrs = [];
    const allowedForTag = new Set([...(allowedAttrs[tag] || []), ...(allowedAttrs['*'] || [])]);

    while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      let attrVal = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] || ''));

      // 1. Unconditionally block event handlers (onclick, onload, onerror, etc.)
      if (attrName.startsWith('on')) continue;

      // 2. Check if attribute is in allowed list
      if (!allowedForTag.has(attrName)) {
        if (attrName === 'style' && allowStyle) {
          // Handled below
        } else {
          continue;
        }
      }

      // 3. Validate URL attributes
      if (['href', 'src', 'action', 'formaction', 'poster'].includes(attrName)) {
        if (!isSafeUrl(attrVal)) continue;
      }

      // 4. Sanitize style attribute
      if (attrName === 'style') {
        if (!allowStyle) continue;
        const sanitizedStyle = cleanStyle(attrVal);
        if (!sanitizedStyle) continue;
        attrVal = sanitizedStyle;
      }

      // 5. Track target="_blank" for anchor links; rel="noopener noreferrer" is enforced below
      if (tag === 'a' && attrName === 'rel') {
        continue;
      }

      cleanAttrs.push(`${attrName}="${escapeHtml(attrVal)}"`);
    }

    if (tag === 'a' && cleanAttrs.some((a) => /^target=".*_blank.*"/i.test(a))) {
      cleanAttrs.push('rel="noopener noreferrer"');
    }

    const attrsString = cleanAttrs.length > 0 ? ' ' + cleanAttrs.join(' ') : '';
    const isSelfClosing = selfClose || ['br', 'hr', 'img', 'input'].includes(tag);
    return `<${tag}${attrsString}${isSelfClosing ? ' /' : ''}>`;
  });

  // 3. Fail closed. The pattern above can only read tags written the way it expects; one it can't read
  //    (<img src="x"onerror=alert(1)>, an unfinished <img src=x onerror=…) used to pass through untouched,
  //    and a browser reads such tags happily. Only the exact form this function writes is allowed to stay a
  //    tag: every other "<" becomes text.
  return (html + tail).replace(CLEAN_TAG_OR_LT, (m) => (m === '<' ? '&lt;' : m));
}
// <tag>, </tag>, <tag name="value" …> or <tag … />, with the quoted, escaped attributes step 2 writes
const CLEAN_TAG_OR_LT = /<\/?[a-z0-9:-]+(?: [a-z0-9:-]+="[^"<>]*")* ?\/?>|</gi;

// SafeHtml Wrapper Class
class SafeHtml {
  constructor(htmlString) {
    this._value = String(htmlString || '');
    this.__isSafeHtml = true;
  }

  // Returns pre-sanitized string
  toString() {
    return this._value;
  }

  // Explicit HTML representation
  toHtml() {
    return this._value;
  }

  valueOf() {
    return this._value;
  }

  [Symbol.toPrimitive]() {
    return this._value;
  }

  get length() {
    return this._value.length;
  }

  // Create SafeHtml from raw trusted string
  static raw(str) {
    return new SafeHtml(str);
  }

  // Clean and wrap string into SafeHtml
  static clean(str, options = {}) {
    return new SafeHtml(cleanHtml(str, options));
  }

  // Check if an object is an instance of SafeHtml
  static isSafe(obj) {
    return Boolean(obj && (obj instanceof SafeHtml || obj.__isSafeHtml === true));
  }
}

// Tagged Template Literal: html`<div>${untrusted}</div>`
function html(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (SafeHtml.isSafe(val)) {
        result += val.toString();
      } else if (Array.isArray(val)) {
        result += val.map((item) => (SafeHtml.isSafe(item) ? item.toString() : escapeHtml(item))).join('');
      } else {
        result += escapeHtml(val);
      }
    }
  }
  return SafeHtml.raw(result);
}

module.exports = {
  cleanHtml,
  sanitizeHtml: cleanHtml,
  stripTags,
  escapeHtml,
  e: escapeHtml,
  unescapeHtml,
  SafeHtml,
  html,
};
