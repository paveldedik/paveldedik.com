// Tests for the pure logic of the page (../site/lib.js).
// Run: node --test eso-rozvrh/site-test/
// Lives outside site/ so it is never deployed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as L from '../site/lib.js';

const sample = () => ({
  schemaVersion: 1,
  checkedAt: '2026-11-10T05:00:00Z',
  updatedAt: '2026-11-10T05:00:00Z',
  source: 'https://www.tanecniskolaeso.cz/tanecni-kurzy',
  venue: { name: 'Taneční škola Eso', address: 'Jana Babáka 2733/11, 612 00 Brno' },
  rooms: [{ id: 'velky', name: 'Velký sál' }, { id: 'maly', name: 'Malý sál' }],
  courses: [
    {
      code: '26B471', category: 'Bambusové taneční', level: 'začátečníci',
      url: 'https://www.tanecniskolaeso.cz/tanecni-kurzy/bambusove-tanecni',
      weekday: 1, start: '18:15', end: '19:45', room: 'velky', roomRaw: 'Velký sál',
      firstDate: '2026-11-30', lastDate: '2027-01-25', lecturer: 'J. Vláčil',
      dates: ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21', '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25'],
      firstSeen: '2026-11-10', lastSeen: '2026-11-10',
    },
    {
      code: '26D352', category: 'Dubové taneční', level: 'mírně pokročilí', url: 'https://www.tanecniskolaeso.cz/tanecni-kurzy/dubove-tanecni',
      weekday: 1, start: '20:00', end: '21:30', room: 'velky', roomRaw: 'Velký sál',
      firstDate: '2026-11-30', lastDate: '2027-01-25', lecturer: 'J. Vláčil',
      dates: ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21', '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25'],
    },
    {
      code: '26B476', category: 'Bambusové taneční', level: 'začátečníci', url: null,
      weekday: 2, start: '18:15', end: '19:45', room: 'maly', roomRaw: 'Malý sál',
      firstDate: '2026-12-01', lastDate: '2026-12-08', lecturer: 'D. Indrák', dates: ['2026-12-01', '2026-12-08'],
    },
  ],
  recurring: [{
    id: 'tancirna', title: 'Tančírna Eso ORIGINAL', url: 'https://www.tanecniskolaeso.cz/akce/tancirna-eso-original',
    weekday: 5, start: '20:00', end: '22:00', room: 'velky',
    skipDates: ['2026-11-27'], respectsClosures: true, respectsHolidays: false,
  }],
  closures: [{ from: '2026-12-23', to: '2027-01-02', label: 'Vánoce' }],
  notes: [{ source: 'https://www.tanecniskolaeso.cz/akce/tancirna-eso-original', text: 'POZOR, 27. 11. tančírna není.' }],
});

const data = () => L.normalizeData(sample());

test('date helpers work on plain Y-M-D, across DST and year boundaries', () => {
  assert.equal(L.isoWeekday('2026-11-30'), 1);
  assert.equal(L.isoWeekday('2026-11-29'), 7);
  assert.equal(L.isoWeekday('1970-01-01'), 4);
  assert.equal(L.mondayOf('2026-11-10'), '2026-11-09');
  assert.equal(L.mondayOf('2026-11-15'), '2026-11-09');
  assert.equal(L.mondayOf('2027-01-01'), '2026-12-28');
  assert.equal(L.addDays('2026-12-28', 7), '2027-01-04');
  // DST changes in Prague: 2026-03-29 and 2026-10-25 - a day is still a day.
  assert.equal(L.addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(L.addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(L.addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(L.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(L.diffDays('2027-01-04', '2026-12-28'), 7);
  assert.equal(L.isoWeek('2026-11-30'), 49);
  assert.equal(L.isoWeek('2027-01-01'), 53);
  assert.equal(L.isoWeek('2027-01-04'), 1);
  assert.equal(L.isoWeek('2024-12-30'), 1);
  assert.ok(L.isYmd('2026-11-30'));
  assert.ok(!L.isYmd('2026-02-30'));
  assert.ok(!L.isYmd('2026-11-3'));
  assert.ok(!L.isYmd(20261130));
});

test('pragueNow reports the Prague wall clock regardless of the host timezone', () => {
  // 23:30 UTC in winter is already the next day in Prague (CET, UTC+1).
  assert.deepEqual(L.pragueNow(new Date('2026-11-29T23:30:00Z')), { date: '2026-11-30', minutes: 30 });
  // Summer time (CEST, UTC+2).
  assert.deepEqual(L.pragueNow(new Date('2026-07-01T21:59:00Z')), { date: '2026-07-01', minutes: 23 * 60 + 59 });
  assert.deepEqual(L.pragueNow(new Date('2026-07-01T22:00:00Z')), { date: '2026-07-02', minutes: 0 });
  // New Year.
  assert.deepEqual(L.pragueNow(new Date('2026-12-31T23:00:00Z')), { date: '2027-01-01', minutes: 0 });
});

test('time and Czech date formatting', () => {
  assert.equal(L.parseTime('18:15'), 1095);
  assert.equal(L.parseTime('8:00'), 480);
  assert.equal(L.parseTime('20.00'), 1200);
  assert.equal(L.parseTime('24:00'), 1440);
  assert.equal(L.parseTime('25:00'), null);
  assert.equal(L.parseTime('abc'), null);
  assert.equal(L.parseTime(null), null);
  assert.equal(L.fmtTime(1095), '18:15');
  assert.equal(L.fmtTime(485), '8:05');
  assert.equal(L.fmtDate('2026-11-30'), '30. 11. 2026');
  assert.equal(L.fmtDateRange('2026-11-30', '2026-12-06'), '30. 11. – 6. 12. 2026');
  assert.equal(L.fmtDateRange('2026-12-28', '2027-01-03'), '28. 12. 2026 – 3. 1. 2027');
  assert.equal(L.fmtDateList(['2026-12-21', '2027-01-04', '2027-01-11']), '21. 12. 2026, 4. 1., 11. 1. 2027');
  assert.equal(L.fmtInstant('2026-11-10T05:00:00Z').text, '10. 11. 2026 v 6:00');
  assert.equal(L.fmtInstant('nonsense'), null);
});

test('Czech public holidays', () => {
  assert.equal(L.easterSunday(2026), '2026-04-05');
  assert.equal(L.easterSunday(2027), '2027-03-28');
  assert.equal(L.holidayName('2026-04-03'), 'Velký pátek');
  assert.equal(L.holidayName('2026-04-06'), 'Velikonoční pondělí');
  assert.equal(L.holidayName('2026-11-17'), 'Den boje za svobodu a demokracii');
  assert.equal(L.holidayName('2026-10-28'), 'Vznik Československa');
  assert.equal(L.holidayName('2026-11-18'), null);
});

test('normalizeData validates, drops broken records and tolerates unknowns', () => {
  assert.throws(() => L.normalizeData(null), /tvar/);
  assert.throws(() => L.normalizeData([]), /tvar/);
  assert.throws(() => L.normalizeData({ schemaVersion: 2 }), /verzi/);

  const empty = L.normalizeData({ schemaVersion: 1 });
  assert.equal(empty.rooms.length, 2);
  assert.deepEqual(empty.courses, []);
  assert.deepEqual(empty.recurring, []);
  assert.equal(empty.venue.name, 'Taneční škola Eso');

  const raw = sample();
  raw.somethingNew = { a: 1 };
  raw.courses.push(
    { code: 'BAD1', category: 'x', start: 'aa', end: '10:00', dates: ['2026-12-01'] },
    { code: 'BAD2', category: 'x', start: '11:00', end: '10:00', dates: ['2026-12-01'] },
    { code: 'BAD3', category: 'x', start: '09:00', end: '10:00', dates: ['2026-13-01', 'zítra'] },
    null,
    'text',
    { code: 'NOROOM', category: 'Jinde', start: '09:00', end: '10:00', room: 'sokolovna', dates: ['2026-12-01'], url: 'javascript:alert(1)' },
    { code: 'NODATES', category: 'Bez dat', start: '09:00', end: '10:00', room: 'maly', firstDate: '2026-12-16', lastDate: '2027-01-06' },
  );
  const d = L.normalizeData(raw);
  // BAD2 (end before start) is kept and runs to midnight: see the dedicated test below.
  assert.deepEqual(d.courses.map((c) => c.code), ['26B471', '26D352', '26B476', 'BAD2', 'NOROOM', 'NODATES']);
  const noroom = d.courses.find((c) => c.code === 'NOROOM');
  assert.equal(noroom.room, null);
  assert.equal(noroom.roomRaw, 'sokolovna');
  assert.equal(noroom.url, null);
  // Missing "dates" falls back to weekly minus closures.
  assert.deepEqual(d.courses.find((c) => c.code === 'NODATES').dates, ['2026-12-16', '2027-01-06']);
  assert.equal(d.courses[0].start, 1095);
  assert.equal(d.recurring[0].respectsClosures, true);
});

test('safeUrl only lets http(s) through', () => {
  assert.equal(L.safeUrl('https://www.tanecniskolaeso.cz/a'), 'https://www.tanecniskolaeso.cz/a');
  assert.equal(L.safeUrl('javascript:alert(1)'), null);
  assert.equal(L.safeUrl('data:text/html,x'), null);
  assert.equal(L.safeUrl('/relative'), null);
  assert.equal(L.safeUrl(undefined), null);
});

test('recurring events: weekly, minus skipDates, minus closures, on holidays', () => {
  const d = data();
  const rec = d.recurring[0];
  const on = (ymd) => L.recurringOccursOn(rec, ymd, d.closures);
  assert.ok(on('2026-11-13'));
  assert.ok(!on('2026-11-12'), 'only on its weekday');
  assert.ok(!on('2026-11-27'), 'skipDates');
  assert.ok(on('2026-12-18'), 'last Friday before Christmas runs');
  assert.ok(!on('2026-12-25'), 'closure');
  assert.ok(!on('2027-01-01'), 'closure');
  assert.ok(on('2027-01-08'), 'first Friday after the closure runs');
  assert.ok(on('2026-04-03'), 'Good Friday: runs on public holidays');
  assert.ok(!L.recurringOccursOn({ ...rec, respectsHolidays: true }, '2026-04-03', d.closures));
  assert.ok(!L.recurringOccursOn({ ...rec, respectsClosures: false, lastDate: '2026-12-20' }, '2026-12-25', d.closures));
  assert.ok(L.recurringOccursOn({ ...rec, respectsClosures: false }, '2026-12-25', d.closures));
});

test('buildWeek places events into halls and computes free windows', () => {
  const d = data();
  const week = L.buildWeek(d, '2026-11-30');
  assert.equal(week.sunday, '2026-12-06');
  assert.equal(week.days.length, 7);

  const mon = week.days[0];
  const [velky, maly] = mon.rooms;
  assert.deepEqual(velky.events.map((e) => e.ref.code), ['26B471', '26D352']);
  assert.deepEqual(velky.free.map(L.fmtFree), ['do 18:15', '19:45–20:00', 'od 21:30']);
  assert.deepEqual(maly.events, []);
  assert.deepEqual(maly.free.map(L.fmtFree), ['celý den']);

  const fri = week.days[4];
  assert.deepEqual(fri.rooms[0].events.map((e) => e.ref.id), ['tancirna']);
  assert.deepEqual(fri.rooms[0].free.map(L.fmtFree), ['do 20:00', 'od 22:00']);

  const xmas = L.buildWeek(d, '2026-12-21');
  assert.equal(xmas.days[0].closure, null);
  assert.equal(xmas.days[0].rooms[0].events.length, 2, '21. 12. still has lessons');
  assert.equal(xmas.days[2].closure.label, 'Vánoce');
  assert.deepEqual(xmas.days[4].rooms[0].events, [], 'no tančírna on 25. 12.');
  assert.deepEqual(xmas.days[4].rooms[0].free, [], 'closed day lists no free windows');
  assert.equal(xmas.days[3].holiday, 'Štědrý den');
});

test('an event whose end is not after its start blocks the hall until midnight', () => {
  const raw = sample();
  raw.courses.push({ code: 'LATE', category: 'Noční', start: '23:00', end: '01:00', room: 'maly', dates: ['2026-11-09'] });
  raw.recurring.push({ id: 'noc', title: 'Noc', weekday: 2, start: '22:00', end: '22:00', room: 'maly' });
  const d = L.normalizeData(raw);
  const late = d.courses.find((c) => c.code === 'LATE');
  assert.deepEqual([late.start, late.end], [1380, 1440]);
  const week = L.buildWeek(d, '2026-11-09');
  assert.deepEqual(week.days[0].rooms[1].events.map((e) => e.ref.code), ['LATE']);
  assert.deepEqual(week.days[0].rooms[1].free.map(L.fmtFree), ['do 23:00']);
  assert.deepEqual(week.days[1].rooms[1].free.map(L.fmtFree), ['do 22:00']);
  assert.deepEqual(L.parseSpan('18:15', '19:45'), { start: 1095, end: 1185 });
  assert.equal(L.parseSpan('24:00', '01:00'), null);
  assert.equal(L.parseSpan('18:15', 'večer'), null);
});

test('a closed day has no free windows even when an event is drawn on it', () => {
  const raw = sample();
  raw.courses.push({ code: 'XMAS', category: 'Zvláštní', start: '19:00', end: '20:00', room: 'velky', dates: ['2026-12-24'] });
  const day = L.buildWeek(L.normalizeData(raw), '2026-12-21').days[3];
  assert.equal(day.closure.label, 'Vánoce');
  assert.deepEqual(day.rooms[0].events.map((e) => e.ref.code), ['XMAS']);
  assert.deepEqual(day.rooms[0].free, []);
  assert.deepEqual(day.rooms[1].free, []);
  assert.equal(day.tentative, false, 'closed wins over tentative');
});

test('data horizon: days after the newest published cycle are only tentatively free', () => {
  const weekly = (first, n) => Array.from({ length: n }, (_, i) => L.addDays(first, 7 * i));
  const course = (code, first, n = 8) => ({ code, category: 'K', start: '18:00', end: '19:30', room: 'velky', dates: weekly(first, n) });
  const make = (...courses) => L.normalizeData({ schemaVersion: 1, courses });

  assert.equal(L.dataHorizon(make()), null);
  assert.equal(L.isTentative(null, '2030-01-01'), false);

  // Autumn cycle Mon-Fri, winter cycle Mon-Wed only (Thu, Fri have no course in it).
  const autumn = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((f, i) => course(`A${i}`, f));
  const winter = [course('W1', '2026-11-30'), course('W2', '2026-12-01'), course('W3', '2026-12-02', 9)];
  const d = make(...autumn, ...winter);
  const hz = L.dataHorizon(d);
  assert.deepEqual(hz.byWeekday.slice(0, 3), ['2027-01-18', '2027-01-19', '2027-01-27']);
  assert.equal(hz.last, '2027-01-27');
  assert.deepEqual(hz.byWeekday.slice(3), ['2027-01-27', '2027-01-27', '2027-01-27', '2027-01-27'], 'weekdays without a course: free until the cycle ends');

  assert.ok(!L.isTentative(hz, '2027-01-18'), 'last Monday lesson');
  assert.ok(L.isTentative(hz, '2027-01-25'), 'Monday after the last lesson');
  assert.ok(!L.isTentative(hz, '2027-01-27'));
  assert.ok(!L.isTentative(hz, '2026-12-11'), 'a Friday inside the cycle is known to be free');
  assert.ok(L.isTentative(hz, '2027-01-29'));

  const week = L.buildWeek(d, '2027-01-25');
  assert.deepEqual(week.days.map((x) => x.tentative), [true, true, false, true, true, true, true]);
  assert.ok(L.buildWeek(d, '2026-12-07').days.every((x) => !x.tentative));

  // One course published far ahead does not push the horizon ...
  const lone = L.dataHorizon(make(...autumn, ...winter, course('SUMMER', '2027-07-05')));
  assert.deepEqual(lone, hz);
  // ... and neither does a next cycle that is only partly listed (1 of 5).
  assert.equal(L.dataHorizon(make(...autumn, course('W1', '2026-11-30'))).last, '2026-11-27');
  // Once half of it is listed, it is the cycle.
  assert.equal(L.dataHorizon(make(...autumn, ...winter)).last, '2027-01-27');
  // A cycle from long ago does not set the bar for today's smaller school.
  const old = ['2024-10-07', '2024-10-08', '2024-10-09', '2024-10-10', '2024-10-11', '2024-10-12'].map((f, i) => course(`O${i}`, f));
  assert.equal(L.dataHorizon(make(...old, course('N1', '2026-11-30'), course('N2', '2026-12-01'))).last, '2027-01-19');
});

test('courses with an unknown room are kept as unassigned', () => {
  const raw = sample();
  raw.courses.push({ code: 'X', category: 'Jinde', start: '10:00', end: '11:00', room: null, roomRaw: 'Sokolovna', dates: ['2026-12-02'] });
  const week = L.buildWeek(L.normalizeData(raw), '2026-11-30');
  assert.equal(week.days[2].unassigned.length, 1);
  assert.equal(week.days[2].unassigned[0].ref.roomRaw, 'Sokolovna');
  assert.equal(week.days[2].rooms[0].events.length, 0);
});

test('week navigation helpers', () => {
  const d = data();
  assert.equal(L.weekHasCourses(d, '2026-11-09'), false);
  assert.equal(L.weekHasCourses(d, '2026-11-30'), true);
  assert.equal(L.weekHasCourses(d, '2026-12-28'), false);
  assert.equal(L.nextCourseWeek(d, '2026-11-09'), '2026-11-30');
  assert.equal(L.nextCourseWeek(d, '2026-12-21'), '2027-01-04');
  assert.equal(L.nextCourseWeek(d, '2027-01-25'), null);
});

test('layoutLanes puts overlapping events side by side', () => {
  const ev = (id, start, end) => ({ id, start, end });
  const out = L.layoutLanes([ev('a', 600, 700), ev('b', 650, 750), ev('c', 700, 800), ev('d', 900, 960)]);
  const by = Object.fromEntries(out.map((e) => [e.id, e]));
  assert.deepEqual([by.a.lane, by.a.lanes], [0, 2]);
  assert.deepEqual([by.b.lane, by.b.lanes], [1, 2]);
  assert.deepEqual([by.c.lane, by.c.lanes], [0, 2]);
  assert.deepEqual([by.d.lane, by.d.lanes], [0, 1]);
  assert.deepEqual(L.layoutLanes([]), []);
  // Back-to-back events do not overlap.
  assert.deepEqual(L.layoutLanes([ev('a', 600, 660), ev('b', 660, 720)]).map((e) => e.lanes), [1, 1]);
});

test('freeWindows merges overlaps and handles edges', () => {
  const w = (events) => L.freeWindows(events).map(L.fmtFree);
  assert.deepEqual(w([]), ['celý den']);
  assert.deepEqual(w([{ start: 0, end: 1440 }]), []);
  assert.deepEqual(w([{ start: 600, end: 700 }, { start: 650, end: 750 }]), ['do 10:00', 'od 12:30']);
  assert.deepEqual(w([{ start: 600, end: 660 }, { start: 660, end: 720 }]), ['do 10:00', 'od 12:00']);
  assert.deepEqual(w([{ start: 1350, end: 1440 }]), ['do 22:30']);
  assert.deepEqual(L.freeWindows([{ start: 600, end: 660 }], 480, 720), [{ start: 480, end: 600 }, { start: 660, end: 720 }]);
});

test('visibleRange and makeScale', () => {
  const evening = [{ start: 1095, end: 1185 }, { start: 1200, end: 1320 }];
  assert.deepEqual(L.visibleRange(evening, 'compact'), { start: 420, fitStart: 1020, end: 1380 });
  assert.deepEqual(L.visibleRange(evening, 'full'), { start: 420, fitStart: 420, end: 1380 });
  assert.deepEqual(L.visibleRange([], 'compact'), { start: 420, fitStart: 1020, end: 1320 });
  // Early and late events widen the range instead of being cut off.
  assert.deepEqual(L.visibleRange([{ start: 390, end: 450 }, { start: 1350, end: 1440 }], 'full'), { start: 360, fitStart: 360, end: 1440 });
  const early = L.visibleRange([{ start: 390, end: 450 }], 'compact');
  assert.equal(early.start, early.fitStart, 'no collapsed band when the day starts early');
  assert.ok(early.start <= 390);

  const scale = L.makeScale({ start: 420, fitStart: 1020, end: 1380 }, 60, 40);
  assert.equal(scale.y(420), 0);
  assert.equal(scale.y(720), 20);
  assert.equal(scale.y(1020), 40);
  assert.equal(scale.y(1080), 100);
  assert.equal(scale.y(0), 0, 'clamped');
  assert.equal(scale.y(1440), scale.height, 'clamped');
  assert.equal(scale.height, 400);
  assert.deepEqual(scale.ticks, [1020, 1080, 1140, 1200, 1260, 1320, 1380]);
  const flat = L.makeScale({ start: 420, fitStart: 420, end: 1380 }, 60, 40);
  assert.equal(flat.band, 0);
  assert.equal(flat.y(480), 60);
});

test('category colours and short titles', () => {
  assert.equal(L.hueFor('Bambusové taneční'), 0);
  assert.equal(L.hueFor('Taneční klub Eso HOBBY'), 5);
  assert.equal(L.hueFor('Tančírna Eso ORIGINAL'), 6);
  const h = L.hueFor('Úplně nový kurz');
  assert.ok(h >= 7 && h <= 9);
  assert.equal(L.hueFor('Úplně nový kurz'), h, 'stable');
  assert.equal(L.shortTitle('Bambusové taneční'), 'Bambusové');
  assert.equal(L.shortTitle('Taneční klub Eso HOBBY'), 'Klub Eso HOBBY');
  assert.equal(L.shortTitle('taneční'), 'taneční');
});

test('Google Calendar links', () => {
  const d = data();
  const course = d.courses[0];

  const single = new URL(L.googleSingleUrl(d, course, '2026-12-07'));
  assert.equal(single.origin + single.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(single.searchParams.get('action'), 'TEMPLATE');
  assert.equal(single.searchParams.get('dates'), '20261207T181500/20261207T194500');
  assert.equal(single.searchParams.get('ctz'), 'Europe/Prague');
  assert.equal(single.searchParams.get('text'), 'Bambusové taneční – Taneční škola Eso');
  assert.equal(single.searchParams.get('location'), 'Taneční škola Eso, Jana Babáka 2733/11, 612 00 Brno');
  assert.equal(single.searchParams.get('recur'), null);
  assert.match(single.searchParams.get('details'), /Lektor: J\. Vláčil/);

  // A course without a gap: one weekly link from the first lesson.
  const plain = d.courses[2];
  const series = new URL(L.googleSeriesUrl(d, plain, '2026-12-08'));
  assert.equal(series.searchParams.get('dates'), '20261201T181500/20261201T194500', 'series starts at the first lesson');
  assert.equal(series.searchParams.get('recur'), 'RRULE:FREQ=WEEKLY;UNTIL=20261208T225959Z');
  assert.equal(L.googleSeriesParts(d, plain).length, 1);

  // A course interrupted by the Christmas closure: no single weekly link ...
  assert.deepEqual(L.skippedDates(course.dates), ['2026-12-28']);
  assert.equal(L.googleSeriesUrl(d, course, '2026-12-07'), null);
  // ... but one link per uninterrupted run, which together add exactly the lessons.
  const parts = L.googleSeriesParts(d, course);
  assert.deepEqual(parts.map((p) => [p.from, p.to, p.count]), [['2026-11-30', '2026-12-21', 4], ['2027-01-04', '2027-01-25', 4]]);
  const added = [];
  for (const p of parts) {
    const u = new URL(p.url);
    const first = u.searchParams.get('dates').slice(0, 8);
    const until = /UNTIL=(\d{8})T225959Z$/.exec(u.searchParams.get('recur'))[1];
    const ymd = (x) => `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6)}`;
    for (let x = ymd(first); x <= ymd(until); x = L.addDays(x, 7)) added.push(x);
    assert.doesNotMatch(u.searchParams.get('details'), /smažte/);
  }
  assert.deepEqual(added, course.dates);

  // A run of one lesson is a plain event; irregular dates still add up exactly.
  const odd = L.googleSeriesParts(d, { ...course, dates: ['2026-11-30', '2026-12-08', '2026-12-15'] });
  assert.deepEqual(odd.map((p) => [p.from, p.count]), [['2026-11-30', 1], ['2026-12-08', 2]]);
  assert.equal(new URL(odd[0].url).searchParams.get('recur'), null);
  // Too fragmented for links: only the .ics is offered.
  assert.deepEqual(L.googleSeriesParts(d, { ...course, dates: ['2026-11-30', '2026-12-14', '2026-12-28', '2027-01-11'] }), []);
  assert.deepEqual(L.weeklyRuns(['2026-12-16', '2027-01-06', '2027-01-13']), [['2026-12-16'], ['2027-01-06', '2027-01-13']]);

  const rec = new URL(L.googleSeriesUrl(d, d.recurring[0], '2026-12-04'));
  assert.equal(rec.searchParams.get('dates'), '20261204T200000/20261204T220000');
  assert.equal(rec.searchParams.get('recur'), 'RRULE:FREQ=WEEKLY');
});

test('ICS escaping and folding', () => {
  assert.equal(L.icsEscape('a, b; c\\d\ne'), 'a\\, b\\; c\\\\d\\ne');
  const long = 'DESCRIPTION:' + 'ěščřžýáíé'.repeat(20);
  const folded = L.icsFold(long);
  const enc = new TextEncoder();
  for (const line of folded.split('\r\n')) assert.ok(enc.encode(line).length <= 75, `line too long: ${enc.encode(line).length}`);
  assert.equal(folded.split('\r\n ').join(''), long, 'unfolding restores the line, no split characters');
  assert.equal(L.icsFold('SHORT:x'), 'SHORT:x');
});

test('course .ics has one VEVENT per lesson with TZID and stable UIDs', () => {
  const d = data();
  const course = d.courses[0];
  const now = new Date('2026-11-10T12:00:00Z');
  const ics = L.courseIcs(d, course, now);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'CRLF line endings only');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 8);
  assert.equal(ics.match(/END:VEVENT/g).length, 8);
  assert.equal(ics.match(/BEGIN:VTIMEZONE/g).length, 1);
  assert.ok(ics.includes('TZID:Europe/Prague'));
  assert.ok(ics.includes('DTSTART;TZID=Europe/Prague:20261130T181500\r\n'));
  assert.ok(ics.includes('DTEND;TZID=Europe/Prague:20270125T194500\r\n'));
  assert.ok(!ics.includes('20261228T'), 'no lesson during the Christmas closure');
  assert.ok(ics.includes('UID:26b471-2026-11-30-1815@eso-rozvrh.paveldedik.com\r\n'));
  assert.ok(ics.includes('DTSTAMP:20261110T120000Z\r\n'));
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:Bambusové taneční – Taneční škola Eso (1/8)'));
  assert.ok(unfolded.includes('LOCATION:Taneční škola Eso\\, Jana Babáka 2733/11\\, 612 00 Brno'));
  assert.ok(unfolded.includes('\\nLektor: J. Vláčil\\n'));
  // UIDs do not depend on when the file is generated.
  const uids = (s) => s.match(/^UID:.*$/gm);
  assert.deepEqual(uids(L.courseIcs(d, course, new Date('2027-01-01T00:00:00Z'))), uids(ics));
  assert.equal(new Set(uids(ics)).size, 8);
});

test('recurring .ics uses RRULE with EXDATE for known exceptions', () => {
  const d = data();
  const ics = L.recurringIcs(d, d.recurring[0], '2026-11-13', new Date('2026-11-10T12:00:00Z'));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 1);
  assert.ok(ics.includes('DTSTART;TZID=Europe/Prague:20261113T200000\r\n'));
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY\r\n'));
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('EXDATE;TZID=Europe/Prague:20261127T200000,20261225T200000,20270101T200000\r\n'));
  // Exceptions before the chosen start are irrelevant.
  const later = L.recurringIcs(d, d.recurring[0], '2026-12-04').replace(/\r\n /g, '');
  assert.ok(later.includes('EXDATE;TZID=Europe/Prague:20261225T200000,20270101T200000\r\n'));
});

test('untrusted text cannot break out of ICS properties', () => {
  const raw = sample();
  raw.courses[0].category = 'Zlý kurz\r\nBEGIN:VEVENT; x, y';
  raw.courses[0].lecturer = 'A\nATTENDEE:mailto:x@example.org';
  const d = L.normalizeData(raw);
  const ics = L.courseIcs(d, d.courses[0], new Date('2026-11-10T12:00:00Z'));
  assert.equal(ics.match(/^BEGIN:VEVENT/gm).length, 8);
  assert.ok(!/^ATTENDEE/m.test(ics));
});

test('the real data file (if the scraper has written it) is accepted', { skip: !existsSync(new URL('../site/data/schedule.json', import.meta.url)) }, () => {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL('../site/data/schedule.json', import.meta.url)), 'utf8'));
  const d = L.normalizeData(raw);
  assert.ok(d.rooms.length >= 1);
  assert.equal(d.courses.length, raw.courses.length, 'no course of the real file is dropped by validation');
  assert.equal(d.recurring.length, raw.recurring.length);
  for (const c of d.courses) {
    assert.ok(c.end > c.start);
    for (const date of c.dates) assert.ok(L.isYmd(date));
    assert.ok(L.courseIcs(d, c).includes('BEGIN:VEVENT'));
  }
});
