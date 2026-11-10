// Pure logic for the Eso hall timetable. No DOM access in this file, so it can
// be imported by node:test (see ../site-test/). All calendar math is done on
// plain "YYYY-MM-DD" strings and minutes-of-day numbers; nothing here depends
// on the visitor's timezone except pragueNow(), which asks Intl for the wall
// clock in Europe/Prague explicitly.

export const TZ = 'Europe/Prague';
export const SCHEMA_VERSION = 1;
export const SITE_HOST = 'eso-rozvrh.paveldedik.com';

const DAY_MS = 86400000;

export const DAY_NAMES = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];
export const DAY_SHORT = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

/* ---------- dates ---------- */

export function dayNum(ymd) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNum(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function isYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  if (y < 1990 || y > 2200) return false;
  return fromDayNum(dayNum(s)) === s;
}

export function addDays(ymd, n) {
  return fromDayNum(dayNum(ymd) + n);
}

export function diffDays(a, b) {
  return dayNum(a) - dayNum(b);
}

/** ISO weekday, 1 = Monday .. 7 = Sunday. */
export function isoWeekday(ymd) {
  return (((dayNum(ymd) + 3) % 7) + 7) % 7 + 1;
}

export function mondayOf(ymd) {
  return addDays(ymd, 1 - isoWeekday(ymd));
}

export function isoWeek(ymd) {
  const thursday = addDays(mondayOf(ymd), 3);
  const jan1 = thursday.slice(0, 4) + '-01-01';
  return Math.floor(diffDays(thursday, jan1) / 7) + 1;
}

/** Wall clock in Prague for a given instant: { date: "YYYY-MM-DD", minutes }. */
export function pragueNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const p = {};
  for (const part of parts) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

/* ---------- times ---------- */

export function parseTime(s) {
  if (typeof s !== 'string') return null;
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function fmtTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function fmtTimeRange(start, end) {
  return `${fmtTime(start)}–${fmtTime(end)}`;
}

/* ---------- Czech formatting ---------- */

export function fmtDate(ymd) {
  return `${Number(ymd.slice(8, 10))}. ${Number(ymd.slice(5, 7))}. ${ymd.slice(0, 4)}`;
}

export function fmtDayMonth(ymd) {
  return `${Number(ymd.slice(8, 10))}. ${Number(ymd.slice(5, 7))}.`;
}

export function fmtDateRange(from, to) {
  if (from.slice(0, 4) === to.slice(0, 4)) return `${fmtDayMonth(from)} – ${fmtDate(to)}`;
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

/** Date list like "30. 11., 7. 12. 2026, 4. 1. 2027" (year shown when it changes or ends). */
export function fmtDateList(dates) {
  return dates.map((d, i) => {
    const next = dates[i + 1];
    return !next || next.slice(0, 4) !== d.slice(0, 4) ? fmtDate(d) : fmtDayMonth(d);
  }).join(', ');
}

/** ISO instant -> Czech date + time in Prague, or null when unparsable. */
export function fmtInstant(iso) {
  const t = Date.parse(iso);
  if (typeof iso !== 'string' || Number.isNaN(t)) return null;
  const p = pragueNow(new Date(t));
  return { date: p.date, text: `${fmtDate(p.date)} v ${fmtTime(p.minutes)}` };
}

/* ---------- Czech public holidays ---------- */

const FIXED_HOLIDAYS = {
  '01-01': 'Nový rok',
  '05-01': 'Svátek práce',
  '05-08': 'Den vítězství',
  '07-05': 'Cyril a Metoděj',
  '07-06': 'Jan Hus',
  '09-28': 'Den české státnosti',
  '10-28': 'Vznik Československa',
  '11-17': 'Den boje za svobodu a demokracii',
  '12-24': 'Štědrý den',
  '12-25': '1. svátek vánoční',
  '12-26': '2. svátek vánoční',
};

export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Name of the Czech public holiday on that date, or null. */
export function holidayName(ymd) {
  const fixed = FIXED_HOLIDAYS[ymd.slice(5)];
  if (fixed) return fixed;
  const easter = easterSunday(Number(ymd.slice(0, 4)));
  if (ymd === addDays(easter, -2)) return 'Velký pátek';
  if (ymd === addDays(easter, 1)) return 'Velikonoční pondělí';
  return null;
}

/* ---------- data normalisation ---------- */

export function safeUrl(u) {
  if (typeof u !== 'string') return null;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Start/end minutes of a record, or null when unusable. An end at or before
 * the start (an event running past midnight, or a mangled time) is treated as
 * "until midnight": the hall must never look free because of a bad end time.
 */
export function parseSpan(startText, endText) {
  const start = parseTime(startText);
  const end = parseTime(endText);
  if (start === null || start >= 1440) return null;
  if (end === null) return null;
  return { start, end: end <= start ? 1440 : end };
}

const DEFAULT_ROOMS = [{ id: 'velky', name: 'Velký sál' }, { id: 'maly', name: 'Malý sál' }];

/**
 * Validates the raw JSON and returns a tidy structure the UI can trust.
 * Throws an Error with a Czech message for unusable input; drops individual
 * broken records instead of failing the whole page.
 */
export function normalizeData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Datový soubor nemá očekávaný tvar.');
  }
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Datový soubor má neznámou verzi (${String(raw.schemaVersion)}).`);
  }

  const rooms = [];
  for (const r of arr(raw.rooms)) {
    const id = str(r && r.id);
    if (id && !rooms.some((x) => x.id === id)) rooms.push({ id, name: str(r.name) || id });
  }
  if (!rooms.length) rooms.push(...DEFAULT_ROOMS);
  const roomIds = new Set(rooms.map((r) => r.id));

  const closures = [];
  for (const c of arr(raw.closures)) {
    if (c && isYmd(c.from) && isYmd(c.to) && c.from <= c.to) {
      closures.push({ from: c.from, to: c.to, label: str(c.label) || 'zavřeno' });
    }
  }

  const courses = [];
  for (const c of arr(raw.courses)) {
    if (!c || typeof c !== 'object') continue;
    const span = parseSpan(c.start, c.end);
    if (!span) continue;
    const { start, end } = span;
    let dates = arr(c.dates).filter(isYmd);
    if (!Array.isArray(c.dates) && isYmd(c.firstDate) && isYmd(c.lastDate)) {
      // Older/partial record without explicit lesson dates: assume weekly.
      for (let d = c.firstDate; d <= c.lastDate && dates.length < 200; d = addDays(d, 7)) {
        if (!findClosure(d, closures) && !holidayName(d)) dates.push(d);
      }
    }
    dates = [...new Set(dates)].sort();
    if (!dates.length) continue;
    const roomRaw = str(c.roomRaw);
    const room = str(c.room);
    const code = str(c.code);
    const category = str(c.category) || code || 'Kurz';
    courses.push({
      kind: 'course',
      key: `course:${code || category}:${dates[0]}:${start}`,
      code,
      category,
      level: str(c.level),
      url: safeUrl(c.url),
      start,
      end,
      room: room && roomIds.has(room) ? room : null,
      roomRaw: roomRaw || (room && !roomIds.has(room) ? room : null),
      lecturer: str(c.lecturer),
      dates,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      hue: hueFor(category),
    });
  }

  const recurring = [];
  for (const r of arr(raw.recurring)) {
    if (!r || typeof r !== 'object') continue;
    const span = parseSpan(r.start, r.end);
    if (!span) continue;
    const { start, end } = span;
    const weekday = Number(r.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) continue;
    const title = str(r.title) || 'Pravidelná akce';
    const room = str(r.room);
    recurring.push({
      kind: 'recurring',
      key: `recurring:${str(r.id) || title}`,
      id: str(r.id) || title,
      title,
      category: title,
      url: safeUrl(r.url),
      weekday,
      start,
      end,
      room: room && roomIds.has(room) ? room : null,
      roomRaw: str(r.roomRaw) || (room && !roomIds.has(room) ? room : null),
      lecturer: str(r.lecturer),
      skipDates: arr(r.skipDates).filter(isYmd).sort(),
      respectsClosures: r.respectsClosures !== false,
      respectsHolidays: r.respectsHolidays === true,
      firstDate: isYmd(r.firstDate) ? r.firstDate : null,
      lastDate: isYmd(r.lastDate) ? r.lastDate : null,
      hue: hueFor(title),
    });
  }

  const notes = [];
  for (const n of arr(raw.notes)) {
    const text = str(typeof n === 'string' ? n : n && n.text);
    if (text) notes.push({ text, source: safeUrl(n && n.source) });
  }

  const venue = raw.venue && typeof raw.venue === 'object' ? raw.venue : {};
  return {
    checkedAt: str(raw.checkedAt),
    updatedAt: str(raw.updatedAt),
    source: safeUrl(raw.source) || 'https://www.tanecniskolaeso.cz/tanecni-kurzy',
    venue: {
      name: str(venue.name) || 'Taneční škola Eso',
      address: str(venue.address) || 'Jana Babáka 2733/11, 612 00 Brno',
    },
    rooms,
    courses,
    recurring,
    closures,
    notes,
  };
}

/* ---------- colours ---------- */

function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const KNOWN_HUES = [
  ['bambus', 0], ['dub', 1], ['cedr', 2], ['palisandr', 3], ['mahagon', 4],
  ['hobby', 5], ['tancirn', 6],
];

/** Stable pastel slot (0..9) for a category name. */
export function hueFor(name) {
  const f = fold(String(name || ''));
  for (const [needle, hue] of KNOWN_HUES) if (f.includes(needle)) return hue;
  let hash = 0;
  for (const ch of f) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return 7 + (hash % 3);
}

/** Shorter label for narrow timetable cells. */
export function shortTitle(name) {
  const s = String(name || '');
  const short = s.replace(/\s+taneční$/i, '').replace(/^Taneční klub\s+/i, 'Klub ');
  return short.trim() || s;
}

/* ---------- occurrences ---------- */

export function findClosure(ymd, closures) {
  for (const c of closures) if (ymd >= c.from && ymd <= c.to) return c;
  return null;
}

export function recurringOccursOn(rec, ymd, closures) {
  if (isoWeekday(ymd) !== rec.weekday) return false;
  if (rec.firstDate && ymd < rec.firstDate) return false;
  if (rec.lastDate && ymd > rec.lastDate) return false;
  if (rec.skipDates.includes(ymd)) return false;
  if (rec.respectsClosures && findClosure(ymd, closures)) return false;
  if (rec.respectsHolidays && holidayName(ymd)) return false;
  return true;
}

/** All events happening on one date: [{ ref, date, start, end, room }]. */
export function eventsOn(data, ymd) {
  const out = [];
  for (const c of data.courses) {
    if (c.dates.includes(ymd)) out.push({ ref: c, date: ymd, start: c.start, end: c.end, room: c.room });
  }
  for (const r of data.recurring) {
    if (recurringOccursOn(r, ymd, data.closures)) {
      out.push({ ref: r, date: ymd, start: r.start, end: r.end, room: r.room });
    }
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end || a.ref.key.localeCompare(b.ref.key));
  return out;
}

/** Model of a whole week starting at `monday`. */
export function buildWeek(data, monday, horizon = dataHorizon(data)) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const events = eventsOn(data, date);
    const closure = findClosure(date, data.closures);
    const rooms = data.rooms.map((room) => {
      const evs = layoutLanes(events.filter((e) => e.room === room.id));
      // A closed day never has free time, even if a stray event is drawn on it.
      return { room, events: evs, free: closure ? [] : freeWindows(evs) };
    });
    days.push({
      date,
      weekday: i + 1,
      holiday: holidayName(date),
      closure,
      // Past the published course cycle: "free" only means "not listed yet".
      tentative: !closure && isTentative(horizon, date),
      rooms,
      unassigned: events.filter((e) => e.room === null),
      count: events.length,
    });
  }
  return { monday, sunday: addDays(monday, 6), days };
}

/* ---------- how far ahead the data can be trusted ---------- */

const CYCLE_SPREAD_DAYS = 28; // courses of one cycle start within about a week of each other
const CYCLE_LOOKBACK_DAYS = 365;

/**
 * The school lists courses one cycle ahead, so after the newest cycle ends the
 * halls look empty only because the next cycle is not published yet.
 *
 * The newest cycle is the latest group of courses starting within four weeks
 * of each other that is at least half as large as the largest such group of
 * the past year (a lone course published far ahead does not move the horizon,
 * and neither does a new cycle that is only partly listed). Returns
 * { byWeekday: [7 x "YYYY-MM-DD"], last } - the last date per ISO weekday up
 * to which that cycle says something - or null when there are no courses.
 * Weekdays without a course in the cycle are known to be free until it ends.
 */
export function dataHorizon(data) {
  const courses = data.courses;
  if (!courses.length) return null;
  const newest = courses.reduce((m, c) => (c.firstDate > m ? c.firstDate : m), courses[0].firstDate);
  const cycleOf = (anchor) => courses.filter(
    (c) => c.firstDate <= anchor && diffDays(anchor, c.firstDate) <= CYCLE_SPREAD_DAYS);
  const anchors = [...new Set(courses.map((c) => c.firstDate))]
    .filter((d) => diffDays(newest, d) <= CYCLE_LOOKBACK_DAYS)
    .sort()
    .reverse();
  const largest = Math.max(...anchors.map((a) => cycleOf(a).length));
  const anchor = anchors.find((a) => cycleOf(a).length * 2 >= largest);
  const cycle = cycleOf(anchor);
  const last = cycle.reduce((m, c) => (c.lastDate > m ? c.lastDate : m), cycle[0].lastDate);
  const byWeekday = [];
  for (let wd = 1; wd <= 7; wd++) {
    const ends = cycle.filter((c) => isoWeekday(c.firstDate) === wd).map((c) => c.lastDate).sort();
    byWeekday.push(ends.length ? ends[ends.length - 1] : last);
  }
  return { byWeekday, last };
}

/** True when `ymd` lies beyond what the published courses cover. */
export function isTentative(horizon, ymd) {
  return Boolean(horizon) && ymd > horizon.byWeekday[isoWeekday(ymd) - 1];
}

/** Monday of the first week after `monday`'s week that has a course lesson, or null. */
export function nextCourseWeek(data, monday) {
  const after = addDays(monday, 6);
  let best = null;
  for (const c of data.courses) {
    for (const d of c.dates) {
      if (d > after && (best === null || d < best)) { best = d; break; }
    }
  }
  return best ? mondayOf(best) : null;
}

export function weekHasCourses(data, monday) {
  const sunday = addDays(monday, 6);
  return data.courses.some((c) => c.dates.some((d) => d >= monday && d <= sunday));
}

/* ---------- layout helpers ---------- */

/**
 * Assigns side-by-side lanes to overlapping events. Returns new objects with
 * `lane` (0-based) and `lanes` (number of lanes in the overlap cluster).
 */
export function layoutLanes(events) {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  let cluster = [];
  let laneEnds = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const e of cluster) e.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const ev of sorted) {
    if (cluster.length && ev.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= ev.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = ev.end;
    clusterEnd = Math.max(cluster.length ? clusterEnd : -1, ev.end);
    cluster.push({ ...ev, lane, lanes: 1 });
  }
  if (cluster.length) flush();
  return out;
}

/** Gaps between events within [from, to), as [{ start, end }] in minutes. */
export function freeWindows(events, from = 0, to = 1440) {
  const busy = events
    .map((e) => [Math.max(from, e.start), Math.min(to, e.end)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = from;
  for (const [s, e] of busy) {
    if (s > cursor) out.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < to) out.push({ start: cursor, end: to });
  return out;
}

/** "do 18:15" / "19:45–20:00" / "od 21:30" / "celý den". */
export function fmtFree(w) {
  if (w.start <= 0 && w.end >= 1440) return 'celý den';
  if (w.start <= 0) return `do ${fmtTime(w.end)}`;
  if (w.end >= 1440) return `od ${fmtTime(w.start)}`;
  return fmtTimeRange(w.start, w.end);
}

const floorHour = (m) => Math.floor(m / 60) * 60;
const ceilHour = (m) => Math.ceil(m / 60) * 60;

/**
 * Visible time range for a week.
 *  - "full":    7:00–23:00, widened to contain every event.
 *  - "compact": the stretch of the day before the first event is squeezed into
 *               a short band [start, fitStart]; the rest is drawn to scale.
 * Returns { start, fitStart, end } in minutes (fitStart === start => no band).
 */
export function visibleRange(events, mode = 'compact') {
  let min = Infinity;
  let max = -Infinity;
  for (const e of events) {
    if (e.start < min) min = e.start;
    if (e.end > max) max = e.end;
  }
  const has = Number.isFinite(min);
  if (mode === 'full') {
    return {
      start: has ? Math.min(7 * 60, floorHour(min)) : 7 * 60,
      fitStart: has ? Math.min(7 * 60, floorHour(min)) : 7 * 60,
      end: has ? Math.max(23 * 60, ceilHour(max)) : 23 * 60,
    };
  }
  const fitStart = has ? Math.max(0, floorHour(min) - 60) : 17 * 60;
  const end = has ? Math.min(1440, Math.max(22 * 60, ceilHour(max) + 60)) : 22 * 60;
  const start = Math.min(7 * 60, fitStart);
  // A band shorter than two hours is not worth collapsing.
  if (fitStart - start < 120) return { start, fitStart: start, end };
  return { start, fitStart, end };
}

/** Piecewise-linear minutes -> pixels mapping for a visibleRange(). */
export function makeScale(range, hourPx, bandPx) {
  const band = range.fitStart > range.start ? bandPx : 0;
  const y = (m) => {
    const c = Math.min(range.end, Math.max(range.start, m));
    if (c <= range.fitStart) {
      return band ? ((c - range.start) / (range.fitStart - range.start)) * band : 0;
    }
    return band + ((c - range.fitStart) / 60) * hourPx;
  };
  const ticks = [];
  for (let m = ceilHour(range.fitStart); m <= range.end; m += 60) ticks.push(m);
  return { y, height: y(range.end), band, ticks };
}

/* ---------- calendar export ---------- */

const pad2 = (n) => String(n).padStart(2, '0');
const calStamp = (ymd, minutes) =>
  `${ymd.replace(/-/g, '')}T${pad2(Math.floor(minutes / 60))}${pad2(minutes % 60)}00`;

/**
 * Google Calendar "template" link. `recur` is an RRULE string without the
 * "RRULE:" prefix. Times are wall-clock in Europe/Prague (ctz).
 */
export function googleCalUrl({ title, date, start, end, location, details, recur }) {
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', title);
  params.set('dates', `${calStamp(date, start)}/${calStamp(date, end)}`);
  params.set('ctz', TZ);
  if (location) params.set('location', location);
  if (details) params.set('details', details);
  if (recur) params.set('recur', `RRULE:${recur}`);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** UNTIL value (UTC) that includes the lesson on `lastDate` and nothing after. */
export function rruleUntil(lastDate) {
  return `${lastDate.replace(/-/g, '')}T225959Z`;
}

/** Weekly grid dates between first and last lesson that have no lesson. */
export function skippedDates(dates) {
  if (dates.length < 2) return [];
  const set = new Set(dates);
  const out = [];
  for (let d = dates[0]; d < dates[dates.length - 1]; d = addDays(d, 7)) {
    if (!set.has(d)) out.push(d);
  }
  return out;
}

export function icsEscape(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** RFC 5545 line folding: max 75 octets per line, continuation starts with a space. */
export function icsFold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75;
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZ}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/**
 * Builds an iCalendar file. events: [{ uid, date, start, end, summary,
 * description?, location?, url?, rrule?, exdates? }]; `now` is the DTSTAMP.
 */
export function buildIcs({ events, name, now = new Date() }) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${SITE_HOST}//Rozvrh salu TS Eso//CS`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (name) lines.push(`X-WR-CALNAME:${icsEscape(name)}`);
  lines.push(`X-WR-TIMEZONE:${TZ}`, ...VTIMEZONE);
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZ}:${calStamp(ev.date, ev.start)}`,
      `DTEND;TZID=${TZ}:${calStamp(ev.date, ev.end)}`,
    );
    if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
    if (ev.exdates && ev.exdates.length) {
      lines.push(`EXDATE;TZID=${TZ}:${ev.exdates.map((d) => calStamp(d, ev.start)).join(',')}`);
    }
    lines.push(`SUMMARY:${icsEscape(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
    if (ev.url) lines.push(`URL:${ev.url}`);
    lines.push('TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

const uidPart = (s) => fold(String(s)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

export function fileSlug(s) {
  return uidPart(s).slice(0, 60);
}

function roomName(data, ref) {
  const room = data.rooms.find((r) => r.id === ref.room);
  return room ? room.name : ref.roomRaw;
}

function locationOf(data) {
  return `${data.venue.name}, ${data.venue.address}`;
}

function describeCourse(data, course) {
  const lines = [];
  lines.push(course.level ? `${course.category} (${course.level})` : course.category);
  if (course.code) lines.push(`Kurz: ${course.code}`);
  const room = roomName(data, course);
  if (room) lines.push(`Sál: ${room}`);
  if (course.lecturer) lines.push(`Lektor: ${course.lecturer}`);
  lines.push(`Lekce (${course.dates.length}): ${fmtDateList(course.dates)}`);
  const skipped = skippedDates(course.dates);
  if (skipped.length) {
    lines.push(`Lekce se nekoná: ${fmtDateList(skipped)}`);
  }
  if (course.url) lines.push(course.url);
  lines.push(`Neoficiální přehled: https://${SITE_HOST}/`);
  return lines.join('\n');
}

function describeRecurring(data, rec) {
  const lines = [rec.title];
  const room = roomName(data, rec);
  if (room) lines.push(`Sál: ${room}`);
  lines.push(`Každý týden: ${DAY_NAMES[rec.weekday - 1]} ${fmtTimeRange(rec.start, rec.end)}`);
  if (rec.url) lines.push(`Aktuální výjimky a zrušené termíny: ${rec.url}`);
  lines.push(`Neoficiální přehled: https://${SITE_HOST}/`);
  return lines.join('\n');
}

export function eventTitle(data, ref) {
  return `${ref.category} – ${data.venue.name}`;
}

/** Google link for the single occurrence on `date`. */
export function googleSingleUrl(data, ref, date) {
  return googleCalUrl({
    title: eventTitle(data, ref),
    date,
    start: ref.start,
    end: ref.end,
    location: locationOf(data),
    details: ref.kind === 'course' ? describeCourse(data, ref) : describeRecurring(data, ref),
  });
}

/** Splits sorted lesson dates into runs of consecutive weeks: [[d, d+7, ...], ...]. */
export function weeklyRuns(dates) {
  const runs = [];
  for (const d of dates) {
    const run = runs[runs.length - 1];
    if (run && diffDays(d, run[run.length - 1]) === 7) run.push(d);
    else runs.push([d]);
  }
  return runs;
}

const MAX_SERIES_PARTS = 3;

/**
 * Google links that together add exactly the lessons of a course. The template
 * link can carry a weekly rule but no exceptions, so a course interrupted by a
 * holiday or the Christmas closure becomes one link per uninterrupted run:
 * [{ from, to, count, url }]. Empty when that would take more than three links
 * (the exact .ics is the better tool then).
 */
export function googleSeriesParts(data, course) {
  const runs = weeklyRuns(course.dates);
  if (course.dates.length < 2 || runs.length > MAX_SERIES_PARTS) return [];
  const details = describeCourse(data, course);
  return runs.map((run) => ({
    from: run[0],
    to: run[run.length - 1],
    count: run.length,
    url: googleCalUrl({
      title: eventTitle(data, course),
      date: run[0],
      start: course.start,
      end: course.end,
      location: locationOf(data),
      details,
      recur: run.length > 1 ? `FREQ=WEEKLY;UNTIL=${rruleUntil(run[run.length - 1])}` : null,
    }),
  }));
}

/**
 * Single Google link for a whole series, or null when one weekly rule cannot
 * express it exactly (a course with a skipped week - see googleSeriesParts).
 */
export function googleSeriesUrl(data, ref, fromDate) {
  if (ref.kind === 'course') {
    const parts = googleSeriesParts(data, ref);
    return parts.length === 1 ? parts[0].url : null;
  }
  return googleCalUrl({
    title: eventTitle(data, ref),
    date: fromDate,
    start: ref.start,
    end: ref.end,
    location: locationOf(data),
    details: describeRecurring(data, ref),
    recur: ref.lastDate ? `FREQ=WEEKLY;UNTIL=${rruleUntil(ref.lastDate)}` : 'FREQ=WEEKLY',
  });
}

/** Exact .ics: one VEVENT per lesson of a course. */
export function courseIcs(data, course, now = new Date()) {
  const description = describeCourse(data, course);
  const total = course.dates.length;
  return buildIcs({
    name: eventTitle(data, course),
    now,
    events: course.dates.map((date, i) => ({
      uid: `${uidPart(course.code || course.category)}-${date}-${pad2(Math.floor(course.start / 60))}${pad2(course.start % 60)}@${SITE_HOST}`,
      date,
      start: course.start,
      end: course.end,
      summary: `${eventTitle(data, course)} (${i + 1}/${total})`,
      description,
      location: locationOf(data),
      url: course.url,
    })),
  });
}

/** .ics for a recurring event from `fromDate` on: RRULE + EXDATE for known exceptions. */
export function recurringIcs(data, rec, fromDate, now = new Date()) {
  const exdates = new Set(rec.skipDates.filter((d) => d > fromDate && isoWeekday(d) === rec.weekday));
  if (rec.respectsClosures) {
    for (const c of data.closures) {
      let d = addDays(c.from, (rec.weekday - isoWeekday(c.from) + 7) % 7);
      for (; d <= c.to; d = addDays(d, 7)) if (d > fromDate) exdates.add(d);
    }
  }
  return buildIcs({
    name: eventTitle(data, rec),
    now,
    events: [{
      uid: `${uidPart(rec.id)}-od-${fromDate}@${SITE_HOST}`,
      date: fromDate,
      start: rec.start,
      end: rec.end,
      summary: eventTitle(data, rec),
      description: describeRecurring(data, rec),
      location: locationOf(data),
      url: rec.url,
      rrule: rec.lastDate ? `FREQ=WEEKLY;UNTIL=${rruleUntil(rec.lastDate)}` : 'FREQ=WEEKLY',
      exdates: [...exdates].sort(),
    }],
  });
}
