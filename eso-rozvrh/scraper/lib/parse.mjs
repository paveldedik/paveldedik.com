// Parsers for the pages of tanecniskolaeso.cz. Everything here is pure:
// HTML string in, plain data + warnings out. Nothing throws on odd input.

import { addDays, diffDays, isoWeekday, ymd } from './dates.mjs';
import {
  cleanText, extractTables, firstAttr, fold, hasClass, innerOf, linesOf, mainContent, textOf, tokenize,
} from './html.mjs';

export const SITE = 'https://www.tanecniskolaeso.cz';
export const LISTING_URL = `${SITE}/tanecni-kurzy`;
export const TANCIRNA_URL = `${SITE}/akce/tancirna-eso-original`;

const NOTE_MAX_LENGTH = 500;

// ---------------------------------------------------------------- small parsers

const DAY_PATTERNS = [
  [1, /^(po|pon|pondel\w*)$/],
  [2, /^(ut|ute|uter\w*)$/],
  [3, /^(st|str|stred\w*)$/],
  [4, /^(ct|ctv|ctvrt\w*)$/],
  [5, /^(pa|pat|pate\w*|patk\w*)$/],
  [6, /^(so|sob|sobot\w*)$/],
  [7, /^(ne|ned|nedel\w*)$/],
];

/** "PO", "Út", "středa", "čt." ... -> ISO weekday 1-7, or null. */
export function parseDay(text) {
  const s = fold(String(text ?? '')).replace(/[^a-z]/g, '');
  for (const [n, re] of DAY_PATTERNS) if (re.test(s)) return n;
  return null;
}

const DAY_WORDS = [
  [1, /\bpondel\w*/],
  [2, /\buter\w*/],
  [3, /\bstred[aeuy]\w*/],
  [4, /\bctvrt(?:ek|ky|ku|ecni)\w*/],
  [5, /\bpat(?:ek|ky|ku|ecni)\w*/],
  [6, /\bsobot\w*/],
  [7, /\bnedel\w*/],
];

/** First full Czech day name in free text -> ISO weekday, or null. */
export function findDayWord(text) {
  const s = fold(String(text ?? ''));
  let best = null;
  for (const [n, re] of DAY_WORDS) {
    const m = re.exec(s);
    if (m && (!best || m.index < best.index)) best = { n, index: m.index };
  }
  return best ? best.n : null;
}

const TIME_RANGE_RE =
  /(?<!\d)(\d{1,2})\s?[:.]\s?(\d{2})(?!\d)\s*(?:h(?:od)?\.?)?\s*(?:-|‐|‑|‒|–|—|−|\baz\b|\bdo\b)\s*(\d{1,2})\s?[:.]\s?(\d{2})(?!\d)/;

/** "18:15 - 19:45", "18.15–19.45", "20.00 až 22.00" -> { start: "18:15", end: "19:45" } or null. */
export function parseTimeRange(text) {
  const m = TIME_RANGE_RE.exec(fold(cleanText(String(text ?? ''))));
  if (!m) return null;
  const [h1, m1, h2, m2] = m.slice(1).map(Number);
  if (h1 > 23 || h2 > 24 || m1 > 59 || m2 > 59) return null;
  if (h2 * 60 + m2 <= h1 * 60 + m1) return null;
  const fmt = (h, min) => `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  return { start: fmt(h1, m1), end: fmt(h2, m2) };
}

/** "Velký sál" -> { room: "velky" }, "Malý sál" -> "maly", anything else -> null; roomRaw keeps the text. */
export function normalizeRoom(text) {
  const roomRaw = cleanText(String(text ?? ''));
  const s = fold(roomRaw);
  const big = /\bvelk/.test(s);
  const small = /\bmal/.test(s);
  return { room: big === small ? null : big ? 'velky' : 'maly', roomRaw };
}

const DATE_RE = /(?<![\d.])(\d{1,2})\s?\.\s?(\d{1,2})\s?\.(?:\s?(20\d{2})(?!\d))?/g;

/** All "D. M." / "D.M.YYYY" occurrences in a (folded) text; year may be null. */
export function findDates(text) {
  const out = [];
  DATE_RE.lastIndex = 0;
  let m;
  while ((m = DATE_RE.exec(text))) {
    const d = +m[1];
    const mo = +m[2];
    const y = m[3] ? +m[3] : null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    if (y !== null && !ymd(y, mo, d)) continue;
    out.push({ start: m.index, end: m.index + m[0].length, d, m: mo, y });
  }
  return out;
}

/**
 * A date written without a year: the nearest occurrence that is not older than
 * ~a month. With a weekday hint only an occurrence on that weekday is accepted.
 */
export function inferYear(month, day, today, weekday = null) {
  const cutoff = addDays(today, -30);
  const limit = addDays(today, 366);
  const y0 = +today.slice(0, 4);
  for (const y of [y0 - 1, y0, y0 + 1]) {
    const date = ymd(y, month, day);
    if (!date || date < cutoff || date > limit) continue;
    if (weekday && isoWeekday(date) !== weekday) continue;
    return date;
  }
  return null;
}

/** Fills in missing years: from a neighbouring date ("28. 10. a 17. 11. 2026"), else by inference. */
function resolveDates(text, dates, { today, weekday = null }) {
  const md = (x) => x.m * 100 + x.d;
  const near = (a, b) => b.start - a.end <= 12;
  for (let i = dates.length - 2; i >= 0; i--) {
    const cur = dates[i];
    const next = dates[i + 1];
    if (cur.y === null && next.y !== null && near(cur, next)) cur.y = md(cur) > md(next) ? next.y - 1 : next.y;
  }
  for (let i = 1; i < dates.length; i++) {
    const cur = dates[i];
    const prev = dates[i - 1];
    if (cur.y === null && prev.y !== null && near(prev, cur)) cur.y = md(cur) < md(prev) ? prev.y + 1 : prev.y;
  }
  for (const x of dates) {
    x.date = x.y !== null ? ymd(x.y, x.m, x.d) : today ? inferYear(x.m, x.d, today, weekday) : null;
  }
  return dates;
}

const RANGE_GAP_RE = /^\s*(?:vcetne)?\s*(?:-|‐|‑|‒|–|—|−|az|do)\s*(?:do)?\s*$/;

// Words that say whether the dates around them are "off" or "on" (text is folded).
const NEG_STRONG = 'ne(?:kona|bezi|probih|probeh|tanci|uci)\\w*|odpad(?:a|aji|ne|nou)\\b|zrusen\\w*|zavren\\w*';
const NEG_WEAK = 'neni|nebude|nebudou|nejsou';
const POS = 'bezi|probih\\w*|probeh\\w*|kona\\w*|tanci(?:me|te)?|normalne|otevren\\w*';

function findStatuses(text, allowWeak) {
  const out = [];
  const scan = (source, neg) => {
    const re = new RegExp(`\\b(?:${source})\\b`, 'g');
    let m;
    while ((m = re.exec(text))) out.push({ index: m.index, neg });
  };
  scan(allowWeak ? `${NEG_STRONG}|${NEG_WEAK}` : NEG_STRONG, true);
  scan(POS, false);
  return out.sort((a, b) => a.index - b.index);
}

/** The status word governing a span: the first one after it, else the last one before it. */
function isNegated(statuses, start, end) {
  const after = statuses.find((s) => s.index >= end);
  if (after) return after.neg;
  const before = statuses.filter((s) => s.index < start).pop();
  return before ? before.neg : false;
}

export function splitSentences(line) {
  return line
    .split(/(?<=[!?;])\s+|(?<=[^\d\s]\.)\s+(?=\p{Lu})/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

const MAX_CLOSURE_DAYS = 31;

/**
 * Reads exceptions from a line of free text:
 *   cancelled - single dates on which something does NOT take place
 *   closures  - date ranges ("23. 12. 2026 až 2. 1. 2027") in which nothing takes place
 * A date counts only when the status word governing it is negative, so
 * "18. 12. 2026 a 8. 1. 2027 tančírna normálně běží" yields nothing.
 * allowWeak also accepts the plain "není / nebude" (used only in a narrow context).
 */
export function analyzeExceptions(line, { today, weekday = null, allowWeak = false } = {}) {
  const cancelled = [];
  const closures = [];
  for (const sentence of splitSentences(cleanText(String(line ?? '')))) {
    const text = fold(sentence);
    const dates = resolveDates(text, findDates(text), { today, weekday });
    if (dates.length === 0) continue;
    const statuses = findStatuses(text, allowWeak);
    if (!statuses.some((s) => s.neg)) continue;
    for (let i = 0; i < dates.length; i++) {
      const cur = dates[i];
      const next = dates[i + 1];
      if (next && RANGE_GAP_RE.test(text.slice(cur.end, next.start))) {
        i++;
        if (!isNegated(statuses, cur.start, next.end)) continue;
        // "23. 12. až 2. 1." without years: infer the start, the end follows it.
        let from = cur.date ?? (today ? inferYear(cur.m, cur.d, today) : null);
        let to = next.date;
        if (from && (!to || to < from) && next.y === null) {
          to = [0, 1].map((k) => ymd(+from.slice(0, 4) + k, next.m, next.d)).find((x) => x && x >= from) ?? null;
        }
        if (from && to && from <= to && diffDays(to, from) <= MAX_CLOSURE_DAYS) closures.push({ from, to });
        continue;
      }
      if (cur.date && isNegated(statuses, cur.start, cur.end)) cancelled.push(cur.date);
    }
  }
  return { cancelled: [...new Set(cancelled)].sort(), closures };
}

const NOTE_RE = /neprobih|neprobeh|netanci|nekona|nebezi|odpada|zrusen|zavren|vanoc|svat(?:ek|ky|ku|cich)|prazdnin/;

function isExceptionNote(line) {
  const text = fold(line);
  return NOTE_RE.test(text) && findDates(text).length > 0;
}

function clip(text) {
  return text.length > NOTE_MAX_LENGTH ? `${text.slice(0, NOTE_MAX_LENGTH - 1).trimEnd()}…` : text;
}

/** Absolute URL on the school's site (Wayback Machine prefixes removed), or null. */
export function normalizeUrl(href, base = LISTING_URL) {
  if (!href) return null;
  const raw = String(href).trim().replace(/^(?:https?:)?\/\/web\.archive\.org\/web\/\d+[a-z_]*\//i, '');
  try {
    const url = new URL(raw, base);
    if (!/^https?:$/.test(url.protocol) || !/(^|\.)tanecniskolaeso\.cz$/i.test(url.hostname)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- course listing

const COLUMN_PATTERNS = {
  code: /^(kurz|kod)/,
  day: /^den\b|^dny\b/,
  time: /^cas\b/,
  place: /^(misto|sal\b|kde)/,
  dates: /^(zacat|termin|datum|od\b)/,
  lecturer: /^(lektor|vyucujici|ucitel)/,
};

function mapColumns(row) {
  const columns = {};
  row.cells.forEach((cell, index) => {
    const text = fold(textOf(cell.tokens));
    for (const [key, re] of Object.entries(COLUMN_PATTERNS)) {
      if (!(key in columns) && re.test(text)) {
        columns[key] = index;
        break;
      }
    }
  });
  return columns;
}

function findHeader(table) {
  for (let i = 0; i < Math.min(table.rows.length, 3); i++) {
    const columns = mapColumns(table.rows[i]);
    if ('code' in columns && 'time' in columns && 'dates' in columns) return { index: i, columns };
  }
  return null;
}

function isDataRow(row) {
  return row.cells.length >= 3 && row.cells.some((c) => c.name === 'td') && textOf(row.cells.flatMap((c) => c.tokens)) !== '';
}

/** "26B471, pondělí 30. 11. 2026 v čase 18:15 - 19:45, místo: Velký sál, lektor: J. Vláčil" */
export function parseKurzNazev(nazev, today) {
  const text = cleanText(String(nazev ?? ''));
  if (!text) return {};
  const out = {};
  const code = text.split(',')[0].trim();
  if (isCourseCode(code)) out.code = code;
  const folded = fold(text);
  const dates = resolveDates(folded, findDates(folded), { today });
  if (dates[0]?.date) out.firstDate = dates[0].date;
  const day = findDayWord(text);
  if (day) out.weekday = day;
  const time = parseTimeRange(text);
  if (time) out.time = time;
  const place = /m[ií]sto:\s*([^,]+)/i.exec(text);
  if (place) out.place = place[1].trim();
  const lecturer = /lektor(?:ka|ky|ři|i)?:\s*(.+)$/i.exec(text);
  if (lecturer) out.lecturer = lecturer[1].replace(/^[.\s]+/, '').trim();
  return out;
}

/** Text that looks like one of the school's course codes: 26B471, 26HB30, 26P70. */
const CODE_LIKE_RE = /(?<![\p{L}\d])\d{2}[A-Z]{1,3}\d{1,4}(?![\p{L}\d])/gu;

function isCourseCode(code) {
  return /^[\p{L}\d][\p{L}\d._/-]{1,19}$/u.test(code);
}

function parseHeading(headingTokens, baseUrl) {
  if (!headingTokens) return { category: null, level: null, url: null };
  const levelEl = innerOf(headingTokens, (t) => hasClass(t, 'kurz-uroven'));
  const level = levelEl ? textOf(levelEl.tokens) || null : null;
  const rest = levelEl ? [...headingTokens.slice(0, levelEl.start), ...headingTokens.slice(levelEl.end + 1)] : headingTokens;
  return {
    category: linesOf(rest).join(' ') || null,
    level,
    url: normalizeUrl(firstAttr(headingTokens, 'href', (t) => t.name === 'a'), baseUrl),
  };
}

function parseCourseRow(row, columns, heading, { baseUrl, today }) {
  const warnings = [];
  const cellTokens = (key) => (key in columns ? row.cells[columns[key]]?.tokens ?? [] : []);
  const cell = (key) => textOf(cellTokens(key));
  const allTokens = row.cells.flatMap((c) => c.tokens);
  const nazev = parseKurzNazev(firstAttr(allTokens, 'data-kurz-nazev'), today);

  let code = cell('code').split(/[\s,]/)[0];
  if (!isCourseCode(code)) code = nazev.code ?? null;
  if (!code) return { error: `no course code in "${cell('code')}"` };

  const time = parseTimeRange(cell('time')) ?? nazev.time;
  if (!time) return { error: `${code}: unreadable time "${cell('time')}"` };

  const dayText = cell('day');
  const dayFromColumn = parseDay(dayText) ?? findDayWord(dayText);
  const datesText = fold(cell('dates'));
  const dates = resolveDates(datesText, findDates(datesText), { today, weekday: null });
  let firstDate = dates[0]?.date ?? null;
  const lastDate = dates.length >= 2 ? dates[dates.length - 1].date : null;
  if (!firstDate && nazev.firstDate && dates.length >= 2) firstDate = nazev.firstDate;
  if (!firstDate || !lastDate) return { error: `${code}: unreadable date range "${cell('dates')}"` };
  if (lastDate < firstDate) return { error: `${code}: date range ends before it starts ("${cell('dates')}")` };
  if (diffDays(lastDate, firstDate) > 400) return { error: `${code}: date range longer than 400 days ("${cell('dates')}")` };
  if (nazev.firstDate && nazev.firstDate !== firstDate) {
    warnings.push(`${code}: first date ${firstDate} in the table differs from ${nazev.firstDate} in data-kurz-nazev; using the table`);
  }

  const weekday = isoWeekday(firstDate);
  const statedDay = dayFromColumn ?? nazev.weekday ?? null;
  if (statedDay && statedDay !== weekday) {
    warnings.push(`${code}: column Den says "${dayText}" but ${firstDate} is weekday ${weekday}; trusting the date`);
  }
  if (isoWeekday(lastDate) !== weekday) {
    warnings.push(`${code}: last date ${lastDate} is on a different weekday than the first date ${firstDate}`);
  }

  const placeText = 'place' in columns ? cell('place') : nazev.place ?? '';
  const { room, roomRaw } = normalizeRoom(placeText || nazev.place || '');
  if (!room) warnings.push(`${code}: unrecognized place "${roomRaw}" (room = null)`);

  const url =
    heading.url ??
    normalizeUrl(firstAttr(allTokens, 'href', (t) => t.name === 'a'), baseUrl) ??
    normalizeUrl(row.attrs['data-href'], baseUrl) ??
    LISTING_URL;

  return {
    course: {
      code,
      category: heading.category ?? firstAttr(cellTokens('code'), 'title') ?? 'Kurz',
      level: heading.level,
      url,
      weekday,
      start: time.start,
      end: time.end,
      room,
      roomRaw,
      firstDate,
      lastDate,
      lecturer: cell('lecturer') || nazev.lecturer || null,
    },
    warnings,
  };
}

/**
 * Parses the course listing.
 *   recognized - the page has the expected structure (course tables or category blocks)
 *   rowCount / failedCount - data rows seen / rows that could not be parsed
 *   markerCount / codeLikeCount - course badges or cart links / code-like texts anywhere on the page
 *   unparsedCodes - code-like texts that did not end up as a course
 */
export function parseListing(html, { baseUrl = LISTING_URL, today } = {}) {
  const tokens = tokenize(String(html ?? ''));
  const warnings = [];
  const courses = [];
  const categoryUrls = new Set();
  let tableCount = 0;
  let rowCount = 0;
  let failedCount = 0;

  const categoryCount = tokens.filter((t) => hasClass(t, 'course-category')).length;
  // Traces of courses that do not depend on the table markup. A page that has
  // them but yields no course was not understood - it is not an empty listing.
  const markerCount = Math.max(
    tokens.filter((t) => hasClass(t, 'course-code-badge')).length,
    tokens.filter((t) => t.type === 'open' && (t.attrs['data-kurz-nazev'] || t.attrs['data-kurz-id'])).length,
  );
  const codeLike = new Set();
  for (const t of tokens) {
    if (t.type === 'text') for (const m of t.text.matchAll(CODE_LIKE_RE)) codeLike.add(m[0]);
  }
  const source = String(html ?? '');
  for (const t of tokens) {
    if (t.type !== 'open' || t.name !== 'a') continue;
    const url = normalizeUrl(t.attrs.href, baseUrl);
    if (url && /\/tanecni-kurzy\/[^/?#]+\/?$/.test(new URL(url).pathname)) categoryUrls.add(url);
  }

  const seen = new Map();
  for (const table of extractTables(tokens, (t) => hasClass(t, 'course-category-title'))) {
    const header = findHeader(table);
    const marked = (table.attrs.class ?? '').split(/\s+/).includes('dkurzu');
    if (!header) {
      if (marked) {
        // Looks like a course table by its class, but the header is not what we know.
        tableCount++;
        const rows = table.rows.filter(isDataRow).length;
        rowCount += rows;
        failedCount += rows;
        const cells = (table.rows[0]?.cells ?? []).map((c) => textOf(c.tokens));
        warnings.push(`course table with an unknown header: ${cells.join(' | ')}`);
      }
      continue;
    }
    tableCount++;
    const heading = parseHeading(table.heading, baseUrl);
    for (const row of table.rows.slice(header.index + 1)) {
      if (!isDataRow(row)) continue;
      rowCount++;
      let result;
      try {
        result = parseCourseRow(row, header.columns, heading, { baseUrl, today });
      } catch (err) {
        result = { error: `unexpected error: ${err.message}` };
      }
      if (result.error) {
        failedCount++;
        warnings.push(`skipped row: ${result.error}`);
        continue;
      }
      warnings.push(...result.warnings);
      const course = result.course;
      const slot = [course.weekday, course.start, course.end, course.room, course.firstDate, course.lastDate].join('|');
      const previous = seen.get(course.code);
      if (previous) {
        if (previous.includes(slot)) continue; // the very same row listed twice
        previous.push(slot);
        const original = course.code;
        course.code = `${original}~${previous.length}`;
        warnings.push(`code ${original} is listed ${previous.length}x with different times; stored as ${course.code}`);
      } else {
        seen.set(course.code, [slot]);
      }
      courses.push(course);
    }
  }

  return {
    recognized: tableCount > 0 || categoryCount > 0,
    tableCount,
    categoryCount,
    rowCount,
    failedCount,
    markerCount,
    codeLikeCount: codeLike.size,
    unparsedCodes: [...codeLike].filter((code) => !seen.has(code)),
    courses,
    categoryUrls: [...categoryUrls],
    warnings,
    /** Is this course code still written anywhere on the page (parsed or not)? */
    mentions: (code) => typeof code === 'string' && code !== '' && source.includes(code),
  };
}

// ---------------------------------------------------------------- course detail page

/** Exceptions announced on a course (category) page: notes verbatim + parsed closures / cancelled dates + the stated number of lessons. */
export function parseDetail(html, { today } = {}) {
  const lines = linesOf(mainContent(tokenize(String(html ?? ''))));
  const notes = [];
  const closures = [];
  const cancelled = new Set();
  for (const line of lines) {
    if (line.length > 2000 || !isExceptionNote(line)) continue;
    if (!notes.includes(clip(line))) notes.push(clip(line));
    const found = analyzeExceptions(line, { today, allowWeak: false });
    closures.push(...found.closures);
    found.cancelled.forEach((d) => cancelled.add(d));
  }
  return { notes: notes.slice(0, 10), closures, cancelled: [...cancelled].sort(), lessonCount: findLessonCount(lines) };
}

/** "Cena zahrnuje 8 lekcí po 1,5 hodině" -> 8; null when not stated or stated in two different ways. */
export function findLessonCount(lines) {
  const counts = new Set();
  for (const line of lines) {
    if (line.length > 2000) continue;
    for (const m of fold(line).matchAll(/\bzahrnuje\s+(\d{1,2})\s+lekc/g)) counts.add(+m[1]);
  }
  const [only] = counts;
  return counts.size === 1 && only >= 1 && only <= 60 ? only : null;
}

// ---------------------------------------------------------------- tančírna

/**
 * The Friday social dance. Returns null fields for whatever could not be read
 * (the caller falls back to the last known values and then to the defaults);
 * recognized = false when the page does not look like the tančírna page at all.
 */
export function parseTancirna(html, { today, weekdayHint = 5 } = {}) {
  const tokens = mainContent(tokenize(String(html ?? '')));
  const result = {
    recognized: /tancirn/.test(fold(textOf(tokens))),
    weekday: null,
    start: null,
    end: null,
    room: null,
    skipDates: [],
    closures: [],
    notes: [],
    warnings: [],
  };
  if (!result.recognized) return result;

  let when = null;
  let where = null;
  for (const table of extractTables(tokens)) {
    for (const row of table.rows) {
      if (row.cells.length < 2) continue;
      const label = fold(textOf(row.cells[0].tokens));
      const rest = row.cells.slice(1).flatMap((c) => [...c.tokens, { type: 'open', name: 'br', attrs: {} }]);
      if (!when && /^kdy\b/.test(label)) when = rest;
      if (!where && /^kde\b/.test(label)) where = rest;
    }
  }

  let lines;
  if (when) {
    lines = linesOf(when);
  } else {
    result.warnings.push('tančírna: no "Kdy:" row found, scanning the whole page text instead');
    lines = linesOf(tokens).filter((line) => line.length <= 2000 && /tancirn/.test(fold(line)) && findDates(fold(line)).length > 0);
  }

  const whenText = lines.join(' \n ');
  for (const line of lines) {
    result.weekday ??= findDayWord(line);
    const time = parseTimeRange(line);
    if (time && !result.start) Object.assign(result, time);
  }
  if (!result.weekday) result.warnings.push(`tančírna: weekday not found in "${clip(whenText)}"`);
  if (!result.start) result.warnings.push(`tančírna: time not found in "${clip(whenText)}"`);
  if (where) {
    result.room = normalizeRoom(textOf(where)).room;
    if (!result.room) result.warnings.push(`tančírna: unrecognized place "${clip(textOf(where))}"`);
  } else {
    result.warnings.push('tančírna: no "Kde:" row found');
  }

  const weekday = result.weekday ?? weekdayHint;
  const skip = new Set();
  for (const line of lines) {
    const found = analyzeExceptions(line, { today, weekday, allowWeak: true });
    found.cancelled.forEach((d) => skip.add(d));
    result.closures.push(...found.closures);
  }
  result.skipDates = [...skip].sort();
  result.notes = [...new Set(lines.map(clip))].slice(0, 10);
  return result;
}
