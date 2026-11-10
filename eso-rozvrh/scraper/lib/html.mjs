// A small, forgiving HTML tokenizer - just enough to read tables, headings and
// text from server-rendered pages. Zero dependencies on purpose (nothing to
// install, audit or upgrade in an unattended weekly job).

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', minus: '−', hellip: '…',
  bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', yacute: 'ý',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Yacute: 'Ý',
  ccaron: 'č', Ccaron: 'Č', scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž',
  rcaron: 'ř', Rcaron: 'Ř', ecaron: 'ě', Ecaron: 'Ě', ncaron: 'ň', Ncaron: 'Ň',
  dcaron: 'ď', Dcaron: 'Ď', tcaron: 'ť', Tcaron: 'Ť', uring: 'ů', Uring: 'Ů',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      try {
        return code > 0 ? String.fromCodePoint(code) : whole;
      } catch {
        return whole;
      }
    }
    return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : whole;
  });
}

/** Collapses every kind of whitespace (incl. &nbsp; and zero-width chars) to single spaces. */
export function cleanText(s) {
  return s
    .replace(/[​‌‍﻿­]/g, '')
    .replace(/[\s   -   　]+/g, ' ')
    .trim();
}

/** Lowercase, without diacritics; keeps string length for precomposed input. */
export function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const RAW_TEXT = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'svg']);
const ATTR_RE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

function parseAttrs(src) {
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(src))) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/**
 * Tokens: { type: 'open', name, attrs } | { type: 'close', name } | { type: 'text', text }.
 * Comments, doctype and the content of script/style/svg/... are dropped.
 */
export function tokenize(html) {
  const tokens = [];
  const n = html.length;
  let i = 0;
  const pushText = (raw) => {
    if (raw) tokens.push({ type: 'text', text: decodeEntities(raw) });
  };
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      pushText(html.slice(i));
      break;
    }
    pushText(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    const next = html[lt + 1] ?? '';
    if (next === '!' || next === '?') {
      const end = html.indexOf('>', lt);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (!/[a-zA-Z\/]/.test(next)) {
      pushText('<');
      i = lt + 1;
      continue;
    }
    // Find the end of the tag, ignoring ">" inside quoted attribute values.
    let j = lt + 1;
    let quote = '';
    while (j < n) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j++;
    }
    const body = html.slice(lt + 1, j);
    i = j + 1;
    if (body[0] === '/') {
      const name = /^\/\s*([a-zA-Z][^\s>\/]*)/.exec(body)?.[1]?.toLowerCase();
      if (name) tokens.push({ type: 'close', name });
      continue;
    }
    const nameMatch = /^([a-zA-Z][^\s>\/]*)/.exec(body);
    if (!nameMatch) continue;
    const name = nameMatch[1].toLowerCase();
    tokens.push({ type: 'open', name, attrs: parseAttrs(body.slice(nameMatch[0].length)) });
    if (RAW_TEXT.has(name) && !/\/\s*$/.test(body)) {
      const closeRe = new RegExp(`</${name}\\s*>`, 'gi');
      closeRe.lastIndex = i;
      const close = closeRe.exec(html);
      i = close ? close.index + close[0].length : n;
      tokens.push({ type: 'close', name });
    }
  }
  return tokens;
}

export function hasClass(token, cls) {
  return token.type === 'open' && (token.attrs.class ?? '').split(/\s+/).includes(cls);
}

/** Tokens inside the first <main> (or the whole document when there is none). */
export function mainContent(tokens) {
  const start = tokens.findIndex((t) => t.type === 'open' && t.name === 'main');
  if (start === -1) return tokens;
  let end = tokens.length;
  for (let i = tokens.length - 1; i > start; i--) {
    if (tokens[i].type === 'close' && tokens[i].name === 'main') {
      end = i;
      break;
    }
  }
  return tokens.slice(start + 1, end);
}

export function textOf(tokens) {
  return cleanText(tokens.map((t) => (t.type === 'text' ? t.text : ' ')).join(''));
}

const BLOCK = new Set([
  'p', 'br', 'div', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'thead', 'tbody', 'section', 'article',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'blockquote', 'dd', 'dt', 'dl', 'header', 'footer', 'nav',
  'form', 'iframe', 'main', 'aside', 'figure', 'figcaption', 'pre', 'address',
]);

/** Text split into lines at block-level boundaries (<p>, <br>, <li>, <td>, ...). */
export function linesOf(tokens) {
  const lines = [];
  let cur = '';
  const flush = () => {
    const s = cleanText(cur);
    if (s) lines.push(s);
    cur = '';
  };
  for (const t of tokens) {
    if (t.type === 'text') cur += t.text;
    else if (BLOCK.has(t.name)) flush();
  }
  flush();
  return lines;
}

/** Tokens of the first element (from the given list) matching the predicate, tags excluded. */
export function innerOf(tokens, predicate) {
  const start = tokens.findIndex((t) => t.type === 'open' && predicate(t));
  if (start === -1) return null;
  const name = tokens[start].name;
  let depth = 1;
  for (let i = start + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.name !== name) continue;
    if (t.type === 'open') depth++;
    else if (t.type === 'close' && --depth === 0) return { start, end: i, tokens: tokens.slice(start + 1, i) };
  }
  return { start, end: tokens.length, tokens: tokens.slice(start + 1) };
}

export function firstAttr(tokens, attr, predicate = () => true) {
  for (const t of tokens) {
    if (t.type === 'open' && t.attrs[attr] && predicate(t)) return t.attrs[attr];
  }
  return null;
}

/**
 * All tables of the document:
 *   { attrs, heading, rows: [{ attrs, cells: [{ name: 'td'|'th', attrs, tokens }] }] }
 * heading = tokens of the nearest heading before the table; a heading matching
 * headingPredicate (e.g. the category title) wins over a plain <h1>-<h4>.
 * Missing </td>/</tr> end tags are tolerated; nested tables become separate tables.
 */
export function extractTables(tokens, headingPredicate = () => false) {
  const tables = [];
  const stack = [];
  let preferred = null;
  let plain = null;
  let heading = null; // heading being collected

  const closeCell = (tb) => {
    tb.cell = null;
  };
  const closeRow = (tb) => {
    closeCell(tb);
    tb.row = null;
  };

  for (const t of tokens) {
    if (heading) {
      if (t.type === 'close' && t.name === heading.name) {
        if (heading.preferred) preferred = heading.tokens;
        else plain = heading.tokens;
        heading = null;
        continue;
      }
      heading.tokens.push(t);
    } else if (t.type === 'open' && /^h[1-4]$/.test(t.name) && stack.length === 0) {
      heading = { name: t.name, tokens: [], preferred: headingPredicate(t) };
      continue;
    }

    const tb = stack[stack.length - 1];
    if (t.type === 'open' && t.name === 'table') {
      if (tb?.cell) tb.cell.tokens.push(t);
      const table = { attrs: t.attrs, heading: preferred ?? plain, rows: [] };
      tables.push(table);
      stack.push({ table, row: null, cell: null });
      continue;
    }
    if (!tb) continue;
    if (t.type === 'close' && t.name === 'table') {
      stack.pop();
      continue;
    }
    if (t.type === 'open' && t.name === 'tr') {
      closeRow(tb);
      tb.row = { attrs: t.attrs, cells: [] };
      tb.table.rows.push(tb.row);
    } else if (t.type === 'close' && t.name === 'tr') {
      closeRow(tb);
    } else if (t.type === 'open' && (t.name === 'td' || t.name === 'th')) {
      if (!tb.row) {
        tb.row = { attrs: {}, cells: [] };
        tb.table.rows.push(tb.row);
      }
      tb.cell = { name: t.name, attrs: t.attrs, tokens: [] };
      tb.row.cells.push(tb.cell);
    } else if (t.type === 'close' && (t.name === 'td' || t.name === 'th')) {
      closeCell(tb);
    } else if (tb.cell) {
      tb.cell.tokens.push(t);
    }
  }
  return tables;
}
