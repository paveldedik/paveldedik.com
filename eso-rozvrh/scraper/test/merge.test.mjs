import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSchedule, hasMeaningfulChange, importListing, mergeClosures, serialize } from '../lib/merge.mjs';
import { parseDetail, parseListing, parseTancirna, TANCIRNA_URL } from '../lib/parse.mjs';
import { fixture, listingPage, row, TODAY } from './helpers.mjs';

const NOW = '2026-11-10T05:00:00Z';
const DUBOVE = 'https://www.tanecniskolaeso.cz/tanecni-kurzy/dubove-tanecni';

function scrape({ prevRaw = null, today = TODAY, nowIso = NOW, listingHtml = fixture('live', 'tanecni-kurzy.html'), withPages = true } = {}) {
  const listing = parseListing(listingHtml, { today });
  const details = new Map();
  let tancirna = { ok: false };
  if (withPages) {
    details.set(DUBOVE, { ok: true, ...parseDetail(fixture('live', 'tanecni-kurzy_dubove-tanecni.html'), { today }) });
    tancirna = { ok: true, ...parseTancirna(fixture('live', 'akce_tancirna-eso-original.html'), { today }) };
  }
  return buildSchedule({ prevRaw, listing, details, tancirna, today, nowIso });
}

const again = (x) => JSON.parse(serialize(x));

test('first run: full contract', () => {
  const { schedule, changed, stats } = scrape();
  assert.equal(changed, true);
  assert.equal(stats.added.length, 12);
  assert.deepEqual(Object.keys(schedule), ['schemaVersion', 'checkedAt', 'updatedAt', 'source', 'venue', 'rooms', 'courses', 'recurring', 'closures', 'notes']);
  assert.equal(schedule.schemaVersion, 1);
  assert.equal(schedule.checkedAt, NOW);
  assert.equal(schedule.updatedAt, NOW);
  assert.deepEqual(schedule.rooms, [{ id: 'velky', name: 'Velký sál' }, { id: 'maly', name: 'Malý sál' }]);
  assert.deepEqual(schedule.courses.map((c) => c.code), [...schedule.courses.map((c) => c.code)].sort());
  assert.deepEqual(schedule.courses[0], {
    code: '26B471', category: 'Bambusové taneční', level: 'začátečníci',
    url: 'https://www.tanecniskolaeso.cz/tanecni-kurzy/bambusove-tanecni',
    weekday: 1, start: '18:15', end: '19:45', room: 'velky', roomRaw: 'Velký sál',
    firstDate: '2026-11-30', lastDate: '2027-01-25', lecturer: 'J. Vláčil',
    dates: ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21', '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25'],
    firstSeen: TODAY, lastSeen: TODAY,
  });
  for (const c of schedule.courses) assert.equal(c.dates.length, 8, c.code);
  assert.deepEqual(schedule.recurring, [{
    id: 'tancirna', title: 'Tančírna Eso ORIGINAL', url: TANCIRNA_URL, weekday: 5, start: '20:00', end: '22:00', room: 'velky',
    skipDates: ['2026-11-27'], respectsClosures: true, respectsHolidays: false,
  }]);
  assert.deepEqual(schedule.closures[0], { from: '2026-12-23', to: '2027-01-02', label: 'Vánoce' });
  assert.ok(schedule.closures.some((c) => c.from === '2027-12-23'), 'future Christmas closures are built in');
  assert.equal(schedule.notes.length, 5);
  assert.ok(serialize(schedule).endsWith('}\n'));
});

test('second run with nothing new: not changed, updatedAt stays, checkedAt and lastSeen move', () => {
  const first = again(scrape().schedule);
  const second = scrape({ prevRaw: first, today: '2026-11-17', nowIso: '2026-11-17T05:00:00Z' });
  assert.equal(second.changed, false);
  assert.equal(second.schedule.checkedAt, '2026-11-17T05:00:00Z');
  assert.equal(second.schedule.updatedAt, NOW);
  assert.ok(second.schedule.courses.every((c) => c.lastSeen === '2026-11-17' && c.firstSeen === TODAY));
  assert.deepEqual(second.stats.added.concat(second.stats.updated), []);
  // byte-identical apart from the three volatile fields
  assert.ok(second.schedule.notes.every((n) => n.lastSeen === '2026-11-17'));
  const strip = (s) => serialize(s).replace(/"(checkedAt|lastSeen)": "[^"]*"/g, '');
  assert.equal(strip(second.schedule), strip(first));
});

test('accumulate: a course that disappears from the listing is kept unchanged', () => {
  const first = again(scrape().schedule);
  const onlyOne = listingPage([row('27D400', 'PO', '18:15 - 19:45', 'Malý sál', '8.2.2027 - 29.3.2027', 'Nový Lektor')]);
  const second = scrape({ prevRaw: first, today: '2026-12-15', nowIso: '2026-12-15T05:00:00Z', listingHtml: onlyOne, withPages: false });
  assert.equal(second.changed, true);
  assert.equal(second.schedule.updatedAt, '2026-12-15T05:00:00Z');
  assert.equal(second.schedule.courses.length, 13);
  assert.deepEqual(second.stats.added, ['27D400']);
  assert.equal(second.stats.kept, 12);
  for (const old of first.courses) {
    assert.deepEqual(second.schedule.courses.find((c) => c.code === old.code), old);
  }
  const fresh = second.schedule.courses.find((c) => c.code === '27D400');
  assert.equal(fresh.dates.length, 7, 'Easter Monday 29. 3. 2027 is left out');
  assert.equal(fresh.lastSeen, '2026-12-15');
  // pages failed this time: tančírna, skip dates and notes are carried over
  assert.deepEqual(second.schedule.recurring, first.recurring);
  assert.deepEqual(second.schedule.notes, first.notes);
});

test('notes: carried while the page fails, however old their lastSeen; dropped with the last lesson of an unlinked page', () => {
  // Unchanged runs are not committed, so `lastSeen` in the repository can be months old.
  const first = again(scrape().schedule);
  assert.ok(first.notes.every((n) => n.lastSeen === TODAY));
  const dubove = (today) => ({ ok: true, ...parseDetail(fixture('live', 'tanecni-kurzy_dubove-tanecni.html'), { today }) });
  const run = (today, details, tancirna = { ok: false }) => buildSchedule({
    prevRaw: first, listing: parseListing(fixture('live', 'tanecni-kurzy.html'), { today }), details, tancirna, today, nowIso: NOW,
  });

  // nine quiet weeks later the tančírna page fails once: its notes stay, nothing changes
  const failed = run('2027-01-19', new Map([[DUBOVE, dubove('2027-01-19')]]));
  assert.deepEqual(failed.schedule.notes.map((n) => n.text), first.notes.map((n) => n.text));
  assert.equal(failed.schedule.notes.filter((n) => n.source === TANCIRNA_URL).length, 4);
  assert.ok(failed.schedule.notes.filter((n) => n.source === TANCIRNA_URL).every((n) => n.lastSeen === TODAY));
  assert.equal(failed.changed, false);
  // ...and a failing course page keeps its notes too
  assert.deepEqual(run('2027-06-01', new Map([[DUBOVE, { ok: false }]])).schedule.notes, first.notes);

  // a course page that is not linked any more: notes stay while one of its courses has a lesson ahead
  const empty = listingPage([row('27X1', 'PO', '18:15 - 19:45', 'Malý sál', '8.3.2027 - 26.4.2027', 'X')]).replaceAll('dubove-tanecni', 'jine-tanecni');
  const unlinked = (today) => buildSchedule({ prevRaw: first, listing: parseListing(empty, { today }), details: new Map(), tancirna: { ok: false }, today, nowIso: NOW });
  assert.equal(unlinked('2027-02-03').schedule.notes.filter((n) => n.source === DUBOVE).length, 1, '26D359 has its last lesson on 3. 2. 2027');
  assert.equal(unlinked('2027-02-04').schedule.notes.filter((n) => n.source === DUBOVE).length, 0);
  assert.equal(unlinked('2027-02-04').schedule.notes.filter((n) => n.source === TANCIRNA_URL).length, 4);
});

test('zero open courses (between cycles): everything accumulated is kept, nothing changes', () => {
  const first = again(scrape().schedule);
  const second = scrape({ prevRaw: first, today: '2026-12-20', nowIso: '2026-12-20T05:00:00Z', listingHtml: listingPage([]), withPages: false });
  assert.equal(second.changed, false);
  assert.deepEqual(second.schedule.courses, first.courses);
});

test('a listed course is updated in place; firstSeen survives', () => {
  const first = again(scrape().schedule);
  const html = fixture('live', 'tanecni-kurzy.html').replace('<td>30.11.2026 - 25.1.2027</td>', '<td>7.12.2026 - 1.2.2027</td>');
  const second = scrape({ prevRaw: first, today: '2026-11-17', nowIso: '2026-11-17T05:00:00Z', listingHtml: html });
  assert.equal(second.changed, true);
  assert.deepEqual(second.stats.updated, ['26B471']);
  const c = second.schedule.courses.find((x) => x.code === '26B471');
  assert.deepEqual([c.firstDate, c.lastDate, c.firstSeen, c.lastSeen, c.dates.length], ['2026-12-07', '2027-02-01', TODAY, '2026-11-17', 8]);
  assert.equal(second.schedule.courses.length, 12);
});

test('a known code with new dates is the same course rescheduled: the old dates are replaced', () => {
  // Real data: the listing of 14. 7. 2026 had 26B471 (Tue 29. 9., Malý sál, D. Indrák) and 26D352
  // (Mon 5. 10., Malý sál). Neither opened; on 10. 11. 2026 both codes are listed again for the next cycle.
  const july = scrape({ today: '2026-07-14', nowIso: '2026-07-14T05:00:00Z', listingHtml: fixture('archive', 'tanecni-kurzy.html'), withPages: false });
  assert.equal(july.schedule.courses.length, 21);
  const before = july.schedule.courses.find((c) => c.code === '26B471');
  assert.deepEqual([before.firstDate, before.room, before.lecturer], ['2026-09-29', 'maly', 'D. Indrák']);

  const november = scrape({ prevRaw: again(july.schedule), withPages: false });
  assert.deepEqual(november.stats.moved, ['26B471', '26D352']);
  assert.deepEqual(november.stats.withdrawn, []);
  assert.equal(november.schedule.courses.length, 31, '19 autumn courses kept + 12 listed');
  assert.deepEqual(november.schedule.courses.filter((c) => /[@~]/.test(c.code)), []);
  const after = november.schedule.courses.find((c) => c.code === '26B471');
  assert.deepEqual([after.firstDate, after.room, after.lecturer, after.firstSeen], ['2026-11-30', 'velky', 'J. Vláčil', '2026-07-14']);
  // Malý sál is not shown as taken on Tuesday evenings in the autumn
  const tuesdayLate = november.schedule.courses.filter((c) => c.room === 'maly' && c.weekday === 2 && c.start === '20:30' && c.dates.includes('2026-10-06'));
  assert.deepEqual(tuesdayLate, []);
  // stable afterwards
  const third = scrape({ prevRaw: again(november.schedule), today: '2026-11-17', nowIso: '2026-11-17T05:00:00Z', withPages: false });
  assert.equal(third.changed, false);
});

test('a course that leaves the listing well before its first lesson is withdrawn', () => {
  const rows = [
    row('27D400', 'PO', '18:15 - 19:45', 'Malý sál', '8.2.2027 - 29.3.2027', 'A'),
    row('27D401', 'ÚT', '18:15 - 19:45', 'Malý sál', '9.2.2027 - 30.3.2027', 'B'),
    row('27D402', 'ST', '18:15 - 19:45', 'Velký sál', '10.2.2027 - 31.3.2027', 'C'),
  ];
  const step = (prevRaw, today, html) => scrape({ prevRaw, today, nowIso: `${today}T05:00:00Z`, listingHtml: html, withPages: false });
  const first = again(step(null, '2027-01-05', listingPage(rows)).schedule);
  assert.equal(first.courses.length, 3);
  const without401 = listingPage([rows[0], rows[2]]);

  // three weeks before the start, the rest of the listing intact: gone, with a warning
  const second = step(first, '2027-01-19', without401);
  assert.deepEqual(second.stats.withdrawn, ['27D401']);
  assert.deepEqual(second.schedule.courses.map((c) => c.code), ['27D400', '27D402']);
  assert.equal(second.changed, true);
  assert.ok(second.warnings.some((w) => w.startsWith('27D401') && w.includes('withdrawn')));
  // if it comes back, it is simply added again
  assert.deepEqual(step(again(second.schedule), '2027-01-26', listingPage(rows)).stats.added, ['27D401']);

  // NOT withdrawn: in the last week before the start (enrolment may just have closed) or once it has started
  for (const today of ['2027-02-02', '2027-02-09', '2027-03-01']) {
    const res = step(first, today, without401);
    assert.deepEqual(res.stats.withdrawn, [], today);
    assert.equal(res.schedule.courses.length, 3, today);
  }
  // NOT withdrawn: the listing is empty, or was not read completely, or still mentions the code
  const unreadable = listingPage([rows[0], row('27D402', 'ST', 'večer', 'Velký sál', '10.2.2027 - 31.3.2027', 'C')]);
  const mentioned = listingPage([rows[0], rows[2]]).replace('</main>', '<p>Kurz 27D401 je obsazen.</p></main>');
  const newMarkup = listingPage([rows[0], rows[2]]).replace('</main>', '<ul><li><b>27D401</b> úterý 18:15</li></ul></main>');
  for (const html of [listingPage([]), unreadable, mentioned, newMarkup]) {
    const res = step(first, '2027-01-19', html);
    assert.deepEqual(res.stats.withdrawn, []);
    assert.equal(res.schedule.courses.length, 3);
  }
});

test('the stated number of lessons is checked against the computed dates', () => {
  const listing = parseListing(listingPage([row('27D400', 'PO', '18:15 - 19:45', 'Malý sál', '8.2.2027 - 29.3.2027', 'A')]), { today: TODAY });
  const build = (lessonCount) => buildSchedule({
    listing, details: new Map([[DUBOVE, { ok: true, notes: [], closures: [], cancelled: [], lessonCount }]]), today: TODAY, nowIso: NOW,
  });
  assert.equal(build(7).warnings.length, 0, '8 Mondays minus Easter Monday');
  assert.equal(build(null).warnings.length, 0);
  assert.match(build(8).warnings.join('\n'), /27D400: 7 lesson dates .* the course page says 8 lessons/);
  assert.equal(parseDetail(fixture('live', 'tanecni-kurzy_dubove-tanecni.html'), { today: TODAY }).lessonCount, 8);
  assert.deepEqual(scrape().warnings, [], 'the live pages agree: 8 lessons everywhere');
});

test('category names survive a change of the heading markup', () => {
  const first = again(scrape().schedule);
  const key = (schedule) => schedule.courses.map((c) => [c.code, c.category, c.level]);
  // the level is no longer in its own element (all class attributes gone)
  const plain = fixture('live', 'tanecni-kurzy.html').replace(/\sclass="[^"]*"/g, '');
  const second = scrape({ prevRaw: first, today: '2026-11-17', nowIso: '2026-11-17T05:00:00Z', listingHtml: plain });
  assert.deepEqual(key(second.schedule), key(first));
  assert.equal(second.changed, false);
  assert.deepEqual(second.warnings, []);
  // an older layout: "<h2>Name - banner<br><small>description</small></h2>"; also on the very first run
  const banner = listingPage([row('27D400', 'PO', '18:15 - 19:45', 'Malý sál', '8.2.2027 - 29.3.2027', 'A')])
    .replace(/<h2.*?<\/h2>/s, '<h2 id="kurz2">Dubové taneční - <span class="akce">AKČNÍ CENA do 19. září!</span><br><small>Úroveň bronzových tanečních.</small></h2>');
  const third = scrape({ prevRaw: first, listingHtml: banner, withPages: false });
  assert.deepEqual(key(third.schedule).find((k) => k[0] === '27D400'), ['27D400', 'Dubové taneční', 'mírně pokročilí']);
  assert.equal(scrape({ listingHtml: banner, withPages: false }).schedule.courses[0].category, 'Dubové taneční');
  // a name nobody has seen is accepted, with a warning
  const fresh = listingPage([row('27E1', 'PO', '18:15 - 19:45', 'Malý sál', '8.2.2027 - 29.3.2027', 'A')]).replace('Dubové taneční', 'Ebenové taneční');
  const fourth = scrape({ prevRaw: first, listingHtml: fresh, withPages: false });
  assert.equal(fourth.schedule.courses.find((c) => c.code === '27E1').category, 'Ebenové taneční');
  assert.ok(fourth.warnings.some((w) => w.includes('new course category "Ebenové taneční"')));
});

test('pruning: only courses that ended more than 400 days ago are dropped', () => {
  const first = again(scrape().schedule);
  first.recurring[0].skipDates = ['2026-11-27', '2027-12-03'];
  first.closures.push({ from: '2026-04-03', to: '2026-04-06', label: 'Velikonoce' });
  const run = (today) => scrape({ prevRaw: first, today, nowIso: `${today}T05:00:00Z`, listingHtml: listingPage([]), withPages: false });
  const kept = run('2028-02-20'); // 26D359 and 26M54 ended 2027-02-03 = 382 days ago, the rest 391+ days ago
  assert.equal(kept.schedule.courses.length, 12);
  const pruned = run('2028-03-05'); // 2027-01-28 is 402 days ago, 2027-02-03 is 396 days ago
  assert.deepEqual(pruned.schedule.courses.map((c) => c.code), ['26D359', '26M54']);
  assert.equal(pruned.stats.pruned.length, 10);
  assert.deepEqual(pruned.schedule.recurring[0].skipDates, ['2027-12-03']);
  assert.ok(!pruned.schedule.closures.some((c) => c.label === 'Velikonoce'));
  assert.ok(pruned.schedule.closures.some((c) => c.from === '2027-12-23'));
});

test('cancelled dates from the course page are removed from that category only', () => {
  const listing = parseListing(fixture('live', 'tanecni-kurzy.html'), { today: TODAY });
  const details = new Map([[DUBOVE, { ok: true, notes: [], closures: [], cancelled: ['2026-12-07', '2026-12-09', '2031-01-01'] }]]);
  const first = buildSchedule({ prevRaw: null, listing, details, today: TODAY, nowIso: NOW });
  const get = (schedule, code) => schedule.courses.find((c) => c.code === code);
  assert.equal(get(first.schedule, '26D352').dates.length, 7); // Monday 7. 12.
  assert.deepEqual(get(first.schedule, '26D352').cancelledDates, ['2026-12-07']);
  assert.deepEqual(get(first.schedule, '26D359').cancelledDates, ['2026-12-09']);
  assert.equal(get(first.schedule, '26B471').dates.length, 8); // other category, also a Monday
  assert.equal('cancelledDates' in get(first.schedule, '26B471'), false);
  // the course page fails next time: the known cancellation is not forgotten
  const second = buildSchedule({ prevRaw: again(first.schedule), listing, details: new Map([[DUBOVE, { ok: false }]]), today: TODAY, nowIso: NOW });
  assert.equal(second.changed, false);
  assert.deepEqual(get(second.schedule, '26D352').cancelledDates, ['2026-12-07']);
});

test('tančírna falls back to last known values, then to defaults', () => {
  const listing = parseListing(listingPage([]), { today: TODAY });
  const base = { listing, today: TODAY, nowIso: NOW };
  const defaults = buildSchedule({ ...base, prevRaw: null }).schedule.recurring[0];
  assert.deepEqual([defaults.weekday, defaults.start, defaults.end, defaults.room, defaults.skipDates], [5, '20:00', '22:00', 'velky', []]);
  const prevRaw = { schemaVersion: 1, courses: [], recurring: [{ id: 'tancirna', weekday: 6, start: '19:00', end: '21:00', room: 'maly', skipDates: ['2026-11-28'] }, { id: 'vlastni', title: 'Ručně přidané' }] };
  const unreadable = { ok: true, weekday: null, start: null, end: null, room: null, skipDates: ['2026-12-05'], closures: [], notes: [] };
  const merged = buildSchedule({ ...base, prevRaw, tancirna: unreadable });
  assert.deepEqual(merged.schedule.recurring[0], {
    id: 'tancirna', title: 'Tančírna Eso ORIGINAL', url: TANCIRNA_URL, weekday: 6, start: '19:00', end: '21:00', room: 'maly',
    skipDates: ['2026-11-28', '2026-12-05'], respectsClosures: true, respectsHolidays: false,
  });
  assert.deepEqual(merged.schedule.recurring[1], { id: 'vlastni', title: 'Ručně přidané' }, 'other recurring entries are left alone');
  assert.ok(merged.warnings.some((w) => w.includes('last known')));
});

test('closures: what the site announces wins, the built-in Christmas closure is only a fallback', () => {
  const xmas = (y) => ({ from: `${y}-12-23`, to: `${y + 1}-01-02`, label: 'Vánoce' });
  // nothing announced: built-in closures for the coming winters
  assert.deepEqual(mergeClosures([], [], { today: TODAY }), [xmas(2026), xmas(2027), xmas(2028)]);
  // the stored built-in one does not stick when the site announces a SHORTER closure
  const shorter = mergeClosures([xmas(2026), xmas(2027)], [{ from: '2026-12-24', to: '2027-01-01' }], { today: TODAY });
  assert.deepEqual(shorter, [{ from: '2026-12-24', to: '2027-01-01', label: 'Vánoce' }, xmas(2027), xmas(2028)]);
  // ...and that closure is remembered once the site no longer mentions it
  assert.deepEqual(mergeClosures(shorter, [], { today: '2027-02-01' }), shorter);
  // a corrected announcement replaces the stored one for the same winter
  const corrected = mergeClosures(shorter, [{ from: '2026-12-22', to: '2027-01-03' }], { today: TODAY });
  assert.deepEqual(corrected, [{ from: '2026-12-22', to: '2027-01-03', label: 'Vánoce' }, xmas(2027), xmas(2028)]);
  // other closures, labels and junk
  const mixed = mergeClosures(
    [{ from: '2026-12-23', to: '2027-01-02', label: 'Vánoční prázdniny' }, { from: 'x', to: 'y' }, { from: '2027-07-01', to: '2027-07-31', label: 'Léto' }],
    [{ from: '2026-12-23', to: '2027-01-02' }, { from: '2027-03-26', to: '2027-03-29' }],
    { today: TODAY },
  );
  assert.deepEqual(mixed, [
    { from: '2026-12-23', to: '2027-01-02', label: 'Vánoční prázdniny' },
    { from: '2027-03-26', to: '2027-03-29', label: 'Zavřeno' },
    { from: '2027-07-01', to: '2027-07-31', label: 'Léto' },
    xmas(2027),
    xmas(2028),
  ]);
});

test('a shorter Christmas closure on the site gives the lessons of 23. 12. back', () => {
  const short = (html) => html.replaceAll('23. 12. 2026 až 2. 1. 2027', '24. 12. 2026 až 1. 1. 2027');
  const first = again(scrape().schedule);
  assert.ok(first.courses.every((c) => !c.dates.includes('2026-12-23')));
  const listing = parseListing(fixture('live', 'tanecni-kurzy.html'), { today: TODAY });
  const details = new Map([[DUBOVE, { ok: true, ...parseDetail(short(fixture('live', 'tanecni-kurzy_dubove-tanecni.html')), { today: TODAY }) }]]);
  const tancirna = { ok: true, ...parseTancirna(short(fixture('live', 'akce_tancirna-eso-original.html')), { today: TODAY }) };
  const second = buildSchedule({ prevRaw: first, listing, details, tancirna, today: TODAY, nowIso: NOW });
  assert.deepEqual(second.schedule.closures.map((c) => `${c.from}..${c.to}`), ['2026-12-24..2027-01-01', '2027-12-23..2028-01-02', '2028-12-23..2029-01-02']);
  const wednesday = second.schedule.courses.find((c) => c.code === '26D359');
  assert.ok(wednesday.dates.includes('2026-12-23'));
  assert.equal(wednesday.dates.length, 9);
  // nobody has to notice by looking at the timetable: the course page says 8 lessons
  assert.ok(second.warnings.some((w) => w.startsWith('26D359: 9 lesson dates')));
});

test('malformed existing data never breaks a run', () => {
  for (const prevRaw of [[], 'x', 42, { courses: 'nope', recurring: [null, 5], closures: [{}], notes: [1] }, { courses: [{ code: 'A' }, null, { code: 5 }] }]) {
    const { schedule, warnings } = scrape({ prevRaw });
    assert.equal(schedule.courses.length, 12);
    assert.ok(Array.isArray(warnings));
  }
});

test('change detection ignores only checkedAt, updatedAt and lastSeen', () => {
  const a = again(scrape().schedule);
  const b = again(a);
  b.checkedAt = b.updatedAt = 'later';
  b.courses[0].lastSeen = '2030-01-01';
  b.notes[0].lastSeen = '2030-01-01';
  assert.equal(hasMeaningfulChange(a, b), false);
  b.courses[0].lecturer = 'Někdo Jiný';
  assert.equal(hasMeaningfulChange(a, b), true);
  assert.equal(hasMeaningfulChange(null, a), true);
});

test('import of an archived listing adds unknown courses only', () => {
  const first = again(scrape().schedule);
  const listing = parseListing(fixture('archive', 'tanecni-kurzy.html'), { today: '2026-07-14' });
  const { schedule, changed, stats } = importListing({ prevRaw: first, listing, seenDate: '2026-07-14', today: TODAY, nowIso: NOW });
  assert.equal(changed, true);
  assert.deepEqual(stats.skipped, ['26B471', '26D352'], 'codes that exist in newer data are not overwritten');
  assert.equal(stats.added.length, 19);
  assert.equal(schedule.courses.length, 31);
  for (const old of first.courses) assert.deepEqual(schedule.courses.find((c) => c.code === old.code), old);
  const imported = schedule.courses.find((c) => c.code === '26B468');
  assert.deepEqual([imported.firstSeen, imported.lastSeen, imported.level, imported.dates.length], ['2026-07-14', '2026-07-14', 'začátečníci', 8]);
  assert.deepEqual(schedule.recurring, first.recurring);
  assert.deepEqual(schedule.notes, first.notes);
  // importing twice changes nothing
  assert.equal(importListing({ prevRaw: again(schedule), listing, seenDate: '2026-07-14', today: TODAY, nowIso: NOW }).changed, false);
});
