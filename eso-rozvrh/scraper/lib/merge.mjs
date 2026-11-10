// Builds the next schedule.json from the previous one plus freshly parsed pages.
// The data ACCUMULATES: the source only lists courses open for enrolment, so a
// course that is no longer listed is kept until long after it has ended.

import { addDays, christmasClosure, isValidDate, lessonDates } from './dates.mjs';
import { fold } from './html.mjs';
import { LISTING_URL, TANCIRNA_URL } from './parse.mjs';

export const SCHEMA_VERSION = 1;
export const KEEP_DAYS = 400;

const VENUE = { name: 'Taneční škola Eso', address: 'Jana Babáka 2733/11, 612 00 Brno' };
const ROOMS = [
  { id: 'velky', name: 'Velký sál' },
  { id: 'maly', name: 'Malý sál' },
];
const TANCIRNA_DEFAULTS = {
  id: 'tancirna',
  title: 'Tančírna Eso ORIGINAL',
  url: TANCIRNA_URL,
  weekday: 5,
  start: '20:00',
  end: '22:00',
  room: 'velky',
  skipDates: [],
  respectsClosures: true,
  respectsHolidays: false,
};
const MAX_NOTES = 30;
// A course that leaves the listing more than this many days before its first
// lesson was withdrawn by the school (see buildSchedule).
export const WITHDRAWN_MARGIN_DAYS = 7;
// Category names as the school writes them; names already in the data file are added to these.
const KNOWN_CATEGORIES = [
  'Bambusové taneční', 'Dubové taneční', 'Cedrové taneční', 'Palisandrové taneční', 'Mahagonové taneční',
  'Taneční klub Eso HOBBY',
];
const MAX_LEVEL_LENGTH = 40;

const isTime = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
const isWeekday = (n) => Number.isInteger(n) && n >= 1 && n <= 7;
const isRoom = (s) => ROOMS.some((r) => r.id === s);

/** Fixed key order => stable diffs. */
function courseRecord(c) {
  const record = {
    code: c.code,
    category: c.category,
    level: c.level ?? null,
    url: c.url,
    weekday: c.weekday,
    start: c.start,
    end: c.end,
    room: c.room ?? null,
    roomRaw: c.roomRaw ?? '',
    firstDate: c.firstDate,
    lastDate: c.lastDate,
    lecturer: c.lecturer ?? null,
    dates: c.dates,
    firstSeen: c.firstSeen,
    lastSeen: c.lastSeen,
  };
  // Extra, optional: lesson dates cancelled on the course page beyond holidays and closures.
  if (c.cancelledDates?.length) record.cancelledDates = c.cancelledDates;
  return record;
}

function isUsableCourse(c) {
  return (
    c && typeof c === 'object' && typeof c.code === 'string' && c.code !== '' &&
    isValidDate(c.firstDate) && isValidDate(c.lastDate) && isWeekday(c.weekday) &&
    isTime(c.start) && isTime(c.end) && Array.isArray(c.dates) && c.dates.every(isValidDate)
  );
}

function isUsableClosure(c) {
  return c && typeof c === 'object' && isValidDate(c.from) && isValidDate(c.to) && c.from <= c.to;
}

function closureLabel(c) {
  const years = [+c.from.slice(0, 4) - 1, +c.from.slice(0, 4)];
  return years.some((y) => c.from <= `${y + 1}-01-02` && c.to >= `${y}-12-23`) ? 'Vánoce' : 'Zavřeno';
}

/** The winter (year of its December) a closure belongs to, or null when it is not around Christmas. */
function winterOf(c) {
  for (const y of [+c.from.slice(0, 4) - 1, +c.from.slice(0, 4)]) {
    if (c.from <= `${y + 1}-01-06` && c.to >= `${y}-12-20`) return y;
  }
  return null;
}

function isBuiltIn(c) {
  const d = christmasClosure(+c.from.slice(0, 4));
  return c.from === d.from && c.to === d.to;
}

/**
 * Closures for the next data file, deduplicated, pruned and sorted.
 *   - what the site says now (parsed) always counts;
 *   - what it said earlier (previous) is kept, except for a winter the site
 *     speaks about right now - there the current wording replaces the old one;
 *   - the built-in Christmas closure 23. 12. - 2. 1. is only a FALLBACK for
 *     winters nobody has announced yet, so that a wording change on the site
 *     cannot bring lessons to Christmas. It never widens an announced closure.
 * A stored closure equal to the built-in one is treated as built-in (the file
 * does not record where a closure came from, and it does not need to).
 */
export function mergeClosures(previous, parsed, { today, coverFrom = today, coverTo = today }) {
  const cutoff = addDays(today, -KEEP_DAYS);
  const labels = new Map();
  for (const c of previous ?? []) {
    if (isUsableClosure(c) && typeof c.label === 'string' && c.label) labels.set(`${c.from}|${c.to}`, c.label);
  }
  const byKey = new Map();
  const winters = new Set();
  const add = (c, label) => {
    if (!isUsableClosure(c) || c.to < cutoff) return;
    const key = `${c.from}|${c.to}`;
    if (!byKey.has(key)) byKey.set(key, { from: c.from, to: c.to, label: label ?? labels.get(key) ?? closureLabel(c) });
    const winter = winterOf(c);
    if (winter !== null) winters.add(winter);
  };
  for (const c of parsed ?? []) add(c);
  const announcedNow = new Set(winters);
  for (const c of previous ?? []) {
    if (!isUsableClosure(c) || isBuiltIn(c)) continue;
    if (announcedNow.has(winterOf(c))) continue;
    add(c);
  }
  const lo = [today, coverFrom].sort()[0];
  const hi = [addDays(today, 800), coverTo].sort()[1];
  for (let y = +lo.slice(0, 4) - 1; y <= +hi.slice(0, 4); y++) {
    const c = christmasClosure(y);
    if (c.to >= lo && c.from <= hi && !winters.has(y)) add(c, c.label);
  }
  return [...byKey.values()].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
}

function compareCourses(a, b) {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

function emptySchedule() {
  return { courses: [], recurring: [], closures: [], notes: [] };
}

/** A course without a level (older page layouts had none) takes the level known for its category. */
function fillLevels(fresh, known) {
  const levels = new Map();
  for (const c of [...known, ...fresh]) if (c.level && !levels.has(c.category)) levels.set(c.category, c.level);
  return fresh.map((c) => (c.level ? c : { ...c, level: levels.get(c.category) ?? null }));
}

/**
 * The category comes from a heading whose markup changes now and then (the level
 * used to be in its own element, a sale banner was once appended, ...). A heading
 * that contains a category name we already know is that category; what stands
 * in front of the name is the level ("začátečníci Bambusové taneční").
 */
function canonicalCategories(fresh, known, warnings) {
  const names = [...new Set([...known.map((c) => c.category), ...KNOWN_CATEGORIES])]
    .filter((n) => typeof n === 'string' && n.trim() !== '')
    .sort((a, b) => b.length - a.length);
  const exact = new Set(names);
  const edge = (ch) => ch === undefined || !/[\p{L}\d]/u.test(ch);
  const reported = new Set();
  return fresh.map((c) => {
    if (typeof c.category !== 'string' || exact.has(c.category)) return c;
    const text = fold(c.category);
    for (const name of names) {
      const needle = fold(name);
      const at = text.indexOf(needle);
      if (at === -1 || !edge(text[at - 1]) || !edge(text[at + needle.length])) continue;
      const prefix = c.category.slice(0, at).replace(/[\s:,;|/–—-]+$/u, '').trim();
      return { ...c, category: name, level: c.level ?? (prefix && prefix.length <= MAX_LEVEL_LENGTH ? prefix : null) };
    }
    if (!reported.has(c.category)) {
      reported.add(c.category);
      warnings.push(`new course category "${c.category}" (first seen with ${c.code}); check that it is a real category name`);
    }
    return c;
  });
}

/** Sanitizes whatever was read from disk; never throws. */
export function normalizePrevious(prev, warnings = []) {
  if (!prev || typeof prev !== 'object' || Array.isArray(prev)) return emptySchedule();
  const list = (x) => (Array.isArray(x) ? x : []);
  const courses = [];
  const codes = new Set();
  for (const c of list(prev.courses)) {
    if (!isUsableCourse(c) || codes.has(c.code)) {
      warnings.push(`existing data: dropping malformed or duplicate course ${JSON.stringify(c?.code ?? c)}`);
      continue;
    }
    codes.add(c.code);
    courses.push(c);
  }
  return {
    ...prev,
    courses,
    recurring: list(prev.recurring).filter((r) => r && typeof r === 'object' && typeof r.id === 'string'),
    closures: list(prev.closures).filter(isUsableClosure),
    notes: list(prev.notes).filter((n) => n && typeof n.text === 'string' && typeof n.source === 'string'),
  };
}

function buildTancirna(previous, parsed, today, warnings) {
  const prev = previous ?? {};
  const pick = (key, valid) => {
    if (parsed && valid(parsed[key])) return parsed[key];
    if (valid(prev[key])) return prev[key];
    return TANCIRNA_DEFAULTS[key];
  };
  let start = TANCIRNA_DEFAULTS.start;
  let end = TANCIRNA_DEFAULTS.end;
  for (const src of [prev, parsed]) {
    if (src && isTime(src.start) && isTime(src.end) && src.start < src.end) ({ start, end } = src);
  }
  if (parsed && (!isWeekday(parsed.weekday) || !isTime(parsed.start) || !isRoom(parsed.room))) {
    warnings.push('tančírna: some values could not be read from the page; using the last known / default ones');
  }
  const cutoff = addDays(today, -KEEP_DAYS);
  const skipDates = [...new Set([...(Array.isArray(prev.skipDates) ? prev.skipDates : []), ...(parsed?.skipDates ?? [])])]
    .filter((d) => isValidDate(d) && d >= cutoff)
    .sort();
  return {
    id: 'tancirna',
    title: typeof prev.title === 'string' && prev.title ? prev.title : TANCIRNA_DEFAULTS.title,
    url: TANCIRNA_URL,
    weekday: pick('weekday', isWeekday),
    start,
    end,
    room: pick('room', isRoom),
    skipDates,
    respectsClosures: typeof prev.respectsClosures === 'boolean' ? prev.respectsClosures : true,
    respectsHolidays: typeof prev.respectsHolidays === 'boolean' ? prev.respectsHolidays : false,
  };
}

function buildNotes(prevNotes, pages, { today, courses }) {
  // pages: [{ source, ok, notes: [text] }] in display order.
  // A page that loaded replaces its notes. Otherwise the notes are carried over:
  //   - page failed to load: until it loads again (one bad fetch must not wipe them);
  //   - page no longer visited (not linked from the listing any more): as long as
  //     a course of that page still has a lesson ahead.
  // Nothing here depends on `lastSeen`: it is not part of "changed", so the copy
  // in the repository can be arbitrarily old.
  const out = [];
  const seen = new Set();
  const add = (source, text, lastSeen) => {
    if (!text || seen.has(text) || out.length >= MAX_NOTES) return;
    seen.add(text);
    out.push({ source, text, lastSeen });
  };
  const carry = (source) => {
    for (const n of prevNotes) {
      if (n.source === source) add(n.source, n.text, isValidDate(n.lastSeen) ? n.lastSeen : today);
    }
  };
  const stillRuns = (source) => courses.some((c) => c.url === source && c.dates.some((d) => d >= today));
  const visited = new Set(pages.map((p) => p.source));
  for (const page of pages) {
    if (page.ok) page.notes.forEach((text) => add(page.source, text, today));
    else carry(page.source);
  }
  for (const source of new Set(prevNotes.map((n) => n.source))) {
    if (!visited.has(source) && stillRuns(source)) carry(source);
  }
  // Course pages first, the tančírna last - whatever the order they were collected in.
  const rank = (n) => (n.source === TANCIRNA_URL ? 1 : 0);
  return out.map((n, i) => [n, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([n]) => n);
}

function dropLastSeen(item) {
  if (!item || typeof item !== 'object') return item;
  const { lastSeen, ...rest } = item;
  return rest;
}

/** The content that matters for "did anything change" (no timestamps, no lastSeen of courses and notes). */
export function meaningful(schedule) {
  if (!schedule || typeof schedule !== 'object') return null;
  const { checkedAt, updatedAt, ...rest } = schedule;
  return {
    ...rest,
    courses: (Array.isArray(rest.courses) ? rest.courses : []).map(dropLastSeen),
    notes: (Array.isArray(rest.notes) ? rest.notes : []).map(dropLastSeen),
  };
}

export function hasMeaningfulChange(before, after) {
  return JSON.stringify(meaningful(before)) !== JSON.stringify(meaningful(after));
}

function finish({ prevRaw, prev, courses, recurring, closures, notes, nowIso }) {
  const draft = {
    schemaVersion: SCHEMA_VERSION,
    checkedAt: nowIso,
    updatedAt: nowIso,
    source: LISTING_URL,
    venue: VENUE,
    rooms: ROOMS,
    courses: courses.sort(compareCourses),
    recurring,
    closures,
    notes,
  };
  const changed = hasMeaningfulChange(prevRaw, draft);
  if (!changed && typeof prev.updatedAt === 'string' && prev.updatedAt) draft.updatedAt = prev.updatedAt;
  return { schedule: draft, changed };
}

function coverage(courses, today) {
  const firsts = courses.map((c) => c.firstDate).concat(today).sort();
  const lasts = courses.map((c) => c.lastDate).concat(today).sort();
  return { coverFrom: firsts[0], coverTo: lasts[lasts.length - 1] };
}

/**
 * One scrape => next schedule.
 *   prevRaw  - parsed existing schedule.json (or null)
 *   listing  - result of parseListing()
 *   details  - Map url -> { ok, notes, closures, cancelled, lessonCount }  (course category pages)
 *   tancirna - { ok, ...parseTancirna() }
 */
export function buildSchedule({ prevRaw, listing, details = new Map(), tancirna = { ok: false }, today, nowIso }) {
  const warnings = [];
  const prev = normalizePrevious(prevRaw, warnings);
  const cutoff = addDays(today, -KEEP_DAYS);
  const prevByCode = new Map(prev.courses.map((c) => [c.code, c]));

  const parsedClosures = [];
  for (const d of details.values()) if (d.ok) parsedClosures.push(...d.closures);
  if (tancirna.ok) parsedClosures.push(...tancirna.closures);
  const closures = mergeClosures(prev.closures, parsedClosures, {
    today,
    ...coverage([...prev.courses, ...listing.courses], today),
  });

  const stats = { listed: listing.courses.length, added: [], updated: [], kept: 0, pruned: [], moved: [], withdrawn: [] };
  const byCode = new Map();
  for (const c of fillLevels(canonicalCategories(listing.courses, prev.courses, warnings), prev.courses)) {
    // A code is the id of one course record at the school. When a known code
    // comes back with other dates, the school has rescheduled that record: in
    // every cycle a few courses that did not open are carried over to the next
    // one under their old code, while new courses get new codes. So the old
    // dates are replaced, never kept next to the new ones - they did not happen.
    const old = prevByCode.get(c.code);
    if (old && c.firstDate > old.lastDate) stats.moved.push(c.code);
    const detail = details.get(c.url);
    const cancelledSource = detail?.ok ? detail.cancelled : old?.cancelledDates ?? [];
    const plain = lessonDates(c.firstDate, c.lastDate, { closures });
    const cancelledDates = cancelledSource.filter((d) => plain.includes(d));
    const dates = plain.filter((d) => !cancelledDates.includes(d));
    if (dates.length === 0) warnings.push(`${c.code}: no lesson dates left between ${c.firstDate} and ${c.lastDate}`);
    else if (detail?.ok && detail.lessonCount && dates.length !== detail.lessonCount) {
      // Catches a wrong assumption about holidays or closures before anyone looks at the timetable.
      warnings.push(`${c.code}: ${dates.length} lesson dates between ${c.firstDate} and ${c.lastDate}, but the course page says ${detail.lessonCount} lessons`);
    }
    const record = courseRecord({
      ...c,
      dates,
      cancelledDates,
      firstSeen: isValidDate(old?.firstSeen) ? old.firstSeen : today,
      lastSeen: today,
    });
    byCode.set(c.code, record);
    if (!old) stats.added.push(c.code);
    else if (JSON.stringify(meaningful({ courses: [old] })) !== JSON.stringify(meaningful({ courses: [record] }))) {
      stats.updated.push(c.code);
    }
  }
  // Courses that are no longer listed. Normally that means "enrolment is over,
  // the course runs" and the record is kept as it was. But a course that leaves
  // a healthy listing well before its first lesson was withdrawn - keeping it
  // would show a hall as occupied by a course that never takes place. Only a
  // listing that was read completely may withdraw anything, and never a code
  // that is still written somewhere on the page.
  const complete = listing.courses.length > 0 && listing.failedCount === 0 && !(listing.unparsedCodes?.length > 0);
  for (const old of prev.courses) {
    if (byCode.has(old.code)) continue;
    if (old.lastDate < cutoff) {
      stats.pruned.push(old.code);
      continue;
    }
    const baseCode = old.code.replace(/[~@].*$/, '');
    if (complete && addDays(today, WITHDRAWN_MARGIN_DAYS) < old.firstDate && !listing.mentions?.(baseCode)) {
      stats.withdrawn.push(old.code);
      warnings.push(`${old.code} (${old.category}, from ${old.firstDate}) left the listing before it started; removed from the timetable as withdrawn`);
      continue;
    }
    byCode.set(old.code, old); // no longer listed: kept exactly as it was
    stats.kept++;
  }

  const prevTancirna = prev.recurring.find((r) => r.id === 'tancirna');
  const recurring = [
    buildTancirna(prevTancirna, tancirna.ok ? tancirna : null, today, warnings),
    ...prev.recurring.filter((r) => r.id !== 'tancirna'),
  ];

  const pages = [...details.entries()].map(([source, d]) => ({ source, ok: d.ok, notes: d.notes ?? [] }));
  pages.push({ source: TANCIRNA_URL, ok: !!tancirna.ok, notes: tancirna.notes ?? [] });
  const notes = buildNotes(prev.notes, pages, { today, courses: [...byCode.values()] });

  const { schedule, changed } = finish({ prevRaw, prev, courses: [...byCode.values()], recurring, closures, notes, nowIso });
  return { schedule, changed, stats, warnings };
}

/**
 * One-off import of an older copy of the listing (e.g. from the Internet Archive):
 * adds only courses whose code is not known yet, never touches existing ones.
 */
export function importListing({ prevRaw, listing, seenDate, today, nowIso }) {
  const warnings = [];
  const prev = normalizePrevious(prevRaw, warnings);
  const known = new Set(prev.courses.map((c) => c.code));
  const fresh = listing.courses.filter((c) => !known.has(c.code));
  const closures = mergeClosures(prev.closures, [], { today, ...coverage([...prev.courses, ...fresh], today) });
  const stats = { listed: listing.courses.length, added: [], skipped: [] };
  const courses = [...prev.courses];
  for (const c of fillLevels(canonicalCategories(listing.courses, prev.courses, warnings), prev.courses)) {
    if (known.has(c.code)) {
      stats.skipped.push(c.code);
      continue;
    }
    const dates = lessonDates(c.firstDate, c.lastDate, { closures });
    courses.push(courseRecord({ ...c, dates, firstSeen: seenDate, lastSeen: seenDate }));
    stats.added.push(c.code);
  }
  const recurring = prev.recurring.length ? prev.recurring : [buildTancirna(null, null, today, warnings)];
  const { schedule, changed } = finish({ prevRaw, prev, courses, recurring, closures, notes: prev.notes, nowIso });
  return { schedule, changed, stats, warnings };
}

/** The last lesson date in the data, or null when there is none. */
export function lastLessonDate(schedule) {
  let last = null;
  for (const c of schedule?.courses ?? []) for (const d of c.dates ?? []) if (last === null || d > last) last = d;
  return last;
}

export function serialize(schedule) {
  return `${JSON.stringify(schedule, null, 2)}\n`;
}
