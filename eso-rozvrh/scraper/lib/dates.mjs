// Date helpers. Dates are "YYYY-MM-DD" strings, handled in UTC so that no
// local time zone or DST can shift a day.

const DAY_MS = 86400000;

export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Returns "YYYY-MM-DD" or null when the day does not exist (31. 2., month 13, ...). */
export function ymd(year, month, day) {
  if (![year, month, day].every(Number.isInteger)) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function isValidDate(s) {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && ymd(+m[1], +m[2], +m[3]) === s;
}

function toMs(s) {
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
}

export function addDays(s, n) {
  return new Date(toMs(s) + n * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  return Math.round((toMs(a) - toMs(b)) / DAY_MS);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(s) {
  return new Date(toMs(s)).getUTCDay() || 7;
}

/** Today's date in Prague, whatever the time zone of the machine (CI runs in UTC). */
export function todayInPrague(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Easter Sunday (Gregorian calendar, anonymous algorithm). */
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
  return ymd(year, month, day);
}

const FIXED_HOLIDAYS = [
  [1, 1, 'Nový rok'],
  [5, 1, 'Svátek práce'],
  [5, 8, 'Den vítězství'],
  [7, 5, 'Den slovanských věrozvěstů Cyrila a Metoděje'],
  [7, 6, 'Den upálení mistra Jana Husa'],
  [9, 28, 'Den české státnosti'],
  [10, 28, 'Den vzniku samostatného československého státu'],
  [11, 17, 'Den boje za svobodu a demokracii'],
  [12, 24, 'Štědrý den'],
  [12, 25, '1. svátek vánoční'],
  [12, 26, '2. svátek vánoční'],
];

const holidayCache = new Map();

/** Czech public holidays of a year: Map "YYYY-MM-DD" -> name. */
export function czechHolidays(year) {
  let map = holidayCache.get(year);
  if (!map) {
    map = new Map();
    for (const [m, d, name] of FIXED_HOLIDAYS) map.set(ymd(year, m, d), name);
    const easter = easterSunday(year);
    if (year >= 2016) map.set(addDays(easter, -2), 'Velký pátek');
    map.set(addDays(easter, 1), 'Velikonoční pondělí');
    holidayCache.set(year, map);
  }
  return map;
}

export function isCzechHoliday(s) {
  return czechHolidays(+s.slice(0, 4)).has(s);
}

export function inClosures(s, closures) {
  return closures.some((c) => c.from <= s && s <= c.to);
}

/**
 * Lesson dates of a course: weekly from firstDate up to lastDate, without
 * public holidays, closures (inclusive ranges) and explicitly cancelled dates.
 */
export function lessonDates(firstDate, lastDate, { closures = [], cancelled = [] } = {}) {
  const out = [];
  const skip = new Set(cancelled);
  for (let d = firstDate, i = 0; d <= lastDate && i < 120; d = addDays(d, 7), i++) {
    if (isCzechHoliday(d) || inClosures(d, closures) || skip.has(d)) continue;
    out.push(d);
  }
  return out;
}

/** The built-in Christmas closure starting in December of the given year. */
export function christmasClosure(year) {
  return { from: `${year}-12-23`, to: `${year + 1}-01-02`, label: 'Vánoce' };
}
