/*
 * Som.js HTML Security & Sanitization Engine: cleanHtml, escapeHtml, stripTags, SafeHtml
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
  '&nbsp;': ' ',
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
  return String(str).replace(/&(?:amp|lt|gt|quot|#39|#039|nbsp);/g, (c) => UNESCAPE_MAP[c] || c);
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
  // Decode HTML entities and strip non-printable characters to prevent scheme evasion
  const decoded = unescapeHtml(String(url)).trim().replace(/[\x00-\x1f\s]/g, '');
  if (/^(?:javascript|vbscript|data):/i.test(decoded)) {
    // Only allow safe static raster images in base64 data URIs (svg is blocked because it can execute script)
    if (/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(decoded)) {
      return true;
    }
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
  let prev;
  const dangerousTagRegex = /<\/?(?:script|style|iframe|object|embed|applet|form|base|meta|link)\b[^>]*>/gi;
  const blockRegex = /<(script|style|iframe|object|embed|applet|form)[\s\S]*?<\/\1>/gi;
  do {
    prev = html;
    html = html
      .replace(blockRegex, '')
      .replace(dangerousTagRegex, '')
      .replace(/<!--[\s\S]*?-->/g, '');
  } while (html !== prev);

  // 2. Parse and sanitize all tags and attributes
  const tagRegex = /<\/?([a-zA-Z0-9:-]+)((?:\s+[a-zA-Z0-9:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;

  html = html.replace(tagRegex, (match, tagName, rawAttrs, selfClose) => {
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

      // 5. Enforce rel="noopener noreferrer" for external anchor links
      if (tag === 'a' && attrName === 'target' && /_blank/i.test(attrVal)) {
        if (!cleanAttrs.some((a) => a.startsWith('rel='))) {
          cleanAttrs.push('rel="noopener noreferrer"');
        }
      }

      cleanAttrs.push(`${attrName}="${escapeHtml(attrVal)}"`);
    }

    const attrsString = cleanAttrs.length > 0 ? ' ' + cleanAttrs.join(' ') : '';
    const isSelfClosing = selfClose || ['br', 'hr', 'img', 'input'].includes(tag);
    return `<${tag}${attrsString}${isSelfClosing ? ' /' : ''}>`;
  });

  return html;
}

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
