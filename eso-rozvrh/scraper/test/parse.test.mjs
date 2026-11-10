import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lessonDates, christmasClosure } from '../lib/dates.mjs';
import { decodeEntities, tokenize, textOf } from '../lib/html.mjs';
import {
  analyzeExceptions, inferYear, normalizeRoom, normalizeUrl, parseDay, parseDetail, parseKurzNazev,
  parseListing, parseTancirna, parseTimeRange,
} from '../lib/parse.mjs';
import { fixture, listingPage, row, TODAY } from './helpers.mjs';

const BASE = 'https://www.tanecniskolaeso.cz/tanecni-kurzy';

test('real listing: all 12 courses with exact fields', () => {
  const listing = parseListing(fixture('live', 'tanecni-kurzy.html'), { today: TODAY });
  assert.equal(listing.recognized, true);
  assert.equal(listing.tableCount, 6);
  assert.equal(listing.rowCount, 12);
  assert.equal(listing.failedCount, 0);
  assert.deepEqual(listing.warnings, []);
  const c = (code, category, level, slug, weekday, start, end, room, firstDate, lastDate, lecturer) => ({
    code, category, level, url: `${BASE}/${slug}`, weekday, start, end, room,
    roomRaw: room === 'velky' ? 'Velký sál' : 'Malý sál', firstDate, lastDate, lecturer,
  });
  assert.deepEqual(listing.courses, [
    c('26B471', 'Bambusové taneční', 'začátečníci', 'bambusove-tanecni', 1, '18:15', '19:45', 'velky', '2026-11-30', '2027-01-25', 'J. Vláčil'),
    c('26B476', 'Bambusové taneční', 'začátečníci', 'bambusove-tanecni', 2, '18:15', '19:45', 'maly', '2026-12-01', '2027-01-26', 'D. Indrák'),
    c('26B477', 'Bambusové taneční', 'začátečníci', 'bambusove-tanecni', 4, '20:00', '21:30', 'velky', '2026-11-26', '2027-01-28', 'M. Slámová'),
    c('26B478', 'Bambusové taneční', 'začátečníci', 'bambusove-tanecni', 7, '18:15', '19:45', 'maly', '2026-11-29', '2027-01-24', 'R. Vláčilová'),
    c('26D352', 'Dubové taneční', 'mírně pokročilí', 'dubove-tanecni', 1, '20:00', '21:30', 'velky', '2026-11-30', '2027-01-25', 'J. Vláčil'),
    c('26D359', 'Dubové taneční', 'mírně pokročilí', 'dubove-tanecni', 3, '18:15', '19:45', 'velky', '2026-12-02', '2027-02-03', 'J. Vláčil'),
    c('26D360', 'Dubové taneční', 'mírně pokročilí', 'dubove-tanecni', 4, '18:15', '19:45', 'velky', '2026-11-26', '2027-01-28', 'J. Sláma'),
    c('26D361', 'Dubové taneční', 'mírně pokročilí', 'dubove-tanecni', 7, '18:15', '19:45', 'velky', '2026-11-29', '2027-01-24', 'F. Radil'),
    c('26C135', 'Cedrové taneční', 'pokročilí', 'cedrove-tanecni', 2, '18:15', '19:45', 'velky', '2026-12-01', '2027-01-26', 'K. Daněk'),
    c('26P70', 'Palisandrové taneční', 'velmi pokročilí', 'palisandrove-tanecni', 2, '20:00', '21:30', 'velky', '2026-12-01', '2027-01-26', 'K. Daněk'),
    c('26M54', 'Mahagonové taneční', 'pro absolventy', 'mahagonove-tanecni', 3, '20:00', '21:30', 'velky', '2026-12-02', '2027-02-03', 'J. Vláčil'),
    c('26HB30', 'Taneční klub Eso HOBBY', null, 'tanecni-klub-eso-hobby', 7, '20:00', '21:30', 'velky', '2026-11-29', '2027-01-24', 'tým TŠ Eso'),
  ]);
  assert.deepEqual(listing.categoryUrls.sort(), [
    'bambusove-tanecni', 'cedrove-tanecni', 'dubove-tanecni', 'mahagonove-tanecni', 'palisandrove-tanecni', 'tanecni-klub-eso-hobby',
  ].map((slug) => `${BASE}/${slug}`));
});

test('real listing: every current course has exactly 8 lessons', () => {
  const listing = parseListing(fixture('live', 'tanecni-kurzy.html'), { today: TODAY });
  for (const course of listing.courses) {
    const dates = lessonDates(course.firstDate, course.lastDate, { closures: [christmasClosure(2026)] });
    assert.equal(dates.length, 8, course.code);
    assert.equal(dates[0], course.firstDate);
    assert.equal(dates.at(-1), course.lastDate);
  }
});

test('archived listing (July 2026): older layout - extra "Stav" column, headings without level and link', () => {
  const listing = parseListing(fixture('archive', 'tanecni-kurzy.html'), { today: '2026-07-14' });
  assert.equal(listing.failedCount, 0);
  assert.equal(listing.courses.length, 21);
  const first = listing.courses[0];
  assert.deepEqual(
    [first.code, first.category, first.level, first.weekday, first.start, first.end, first.room, first.firstDate, first.lastDate, first.lecturer],
    ['26B468', 'Bambusové taneční', null, 1, '20:00', '21:30', 'velky', '2026-10-05', '2026-11-23', 'J. Vláčil'],
  );
  assert.equal(first.url, `${BASE}/bambusove-tanecni`);
  for (const course of listing.courses) assert.equal(lessonDates(course.firstDate, course.lastDate).length, 8, course.code);
});

test('format tolerance: columns by name, dashes, dots, spaces, full day names', () => {
  const html = listingPage(
    [
      row('J. Novák', '18.15&nbsp;–&nbsp;19.45', '<b>27X1</b>', 'pondělí', '30. 11. 2026 — 25. 1. 2027', 'VELKÝ SÁL'),
      row('  A. Malá ', '9:00-10:30', '27X2', 'So', '5.12. - 30.1.2027', 'maly sal'),
      row('', '20:00 až 21:30', '27X3', 'čtvrtek', '26.&nbsp;11.&nbsp;2026 &ndash; 28.&nbsp;1.&nbsp;2027', 'Sokolovna Židenice'),
    ],
    '<th>Lektor</th><th> Čas </th><th>KURZ</th><th>Den</th><th>Začátek kurzu</th><th>Místo</th>',
  );
  const listing = parseListing(html, { today: TODAY });
  assert.equal(listing.failedCount, 0);
  const pick = (c) => [c.code, c.weekday, c.start, c.end, c.room, c.roomRaw, c.firstDate, c.lastDate, c.lecturer];
  assert.deepEqual(listing.courses.map(pick), [
    ['27X1', 1, '18:15', '19:45', 'velky', 'VELKÝ SÁL', '2026-11-30', '2027-01-25', 'J. Novák'],
    ['27X2', 6, '09:00', '10:30', 'maly', 'maly sal', '2026-12-05', '2027-01-30', 'A. Malá'],
    ['27X3', 4, '20:00', '21:30', null, 'Sokolovna Židenice', '2026-11-26', '2027-01-28', null],
  ]);
  assert.equal(listing.courses[0].category, 'Dubové taneční');
  assert.equal(listing.courses[0].level, 'mírně pokročilí');
  assert.ok(listing.warnings.some((w) => w.includes('27X3') && w.includes('unrecognized place')));
});

test('a bad row is skipped with a warning and does not affect the others', () => {
  const html = listingPage([
    row('27A1', 'PO', '18:15 - 19:45', 'Velký sál', '30.11.2026 - 25.1.2027', 'X'),
    row('27A2', 'PO', 'večer', 'Velký sál', '30.11.2026 - 25.1.2027', 'X'),
    row('27A3', 'PO', '18:15 - 19:45', 'Velký sál', 'brzy', 'X'),
    row('27A4', 'PO', '18:15 - 19:45', 'Velký sál', '25.1.2027 - 30.11.2026', 'X'),
    row('27A5', 'PO', '18:15 - 19:45', 'Velký sál', '31.2.2027 - 30.4.2027', 'X'),
    '<tr><td colspan="7">Další kurzy připravujeme</td></tr>',
    row('27A6', 'ÚT', '20:00 - 21:30', 'Malý sál', '1.12.2026 - 26.1.2027', 'Y'),
  ]);
  const listing = parseListing(html, { today: TODAY });
  assert.deepEqual(listing.courses.map((c) => c.code), ['27A1', '27A6']);
  assert.equal(listing.rowCount, 6);
  assert.equal(listing.failedCount, 4);
  assert.equal(listing.warnings.filter((w) => w.startsWith('skipped row')).length, 4);
});

test('weekday: the date wins over the Den column, with a warning', () => {
  const listing = parseListing(listingPage([row('27A1', 'ÚT', '18:15 - 19:45', 'Velký sál', '30.11.2026 - 25.1.2027', 'X')]), { today: TODAY });
  assert.equal(listing.courses[0].weekday, 1);
  assert.ok(listing.warnings.some((w) => w.includes('trusting the date')));
});

test('data-kurz-nazev is a fallback for missing cells', () => {
  const nazev = '26B471, pondělí 30. 11. 2026 v čase 18:15 - 19:45, místo: Velký sál, lektor: . tým TŠ Eso';
  assert.deepEqual(parseKurzNazev(nazev, TODAY), {
    code: '26B471', firstDate: '2026-11-30', weekday: 1, time: { start: '18:15', end: '19:45' }, place: 'Velký sál', lecturer: 'tým TŠ Eso',
  });
  const html = listingPage(
    [`<tr><th><span>26B471</span></th><td>30.11.2026 - 25.1.2027</td><td><a data-kurz-nazev="${nazev}" href="#">Do košíku</a></td></tr>`],
    '<th>Kurz</th><th>Začátek</th><th>Čas</th>',
  );
  const [course] = parseListing(html, { today: TODAY }).courses;
  assert.deepEqual([course.start, course.end, course.room, course.lecturer, course.weekday], ['18:15', '19:45', 'velky', 'tým TŠ Eso', 1]);
});

test('listing structure recognition', () => {
  assert.equal(parseListing('<html><body><h1>503 Service Unavailable</h1></body></html>').recognized, false);
  assert.equal(parseListing('').recognized, false);
  // a course table whose header is no longer understood: rows count as failed
  const odd = parseListing('<table class="dkurzu"><tr><th>A</th><th>B</th><th>C</th></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>');
  assert.deepEqual([odd.recognized, odd.rowCount, odd.failedCount, odd.courses.length], [true, 1, 1, 0]);
  // valid structure, no courses
  const empty = parseListing(listingPage([]), { today: TODAY });
  assert.deepEqual([empty.recognized, empty.rowCount, empty.courses.length], [true, 0, 0]);
  const blocksOnly = parseListing('<div class="course-category mb-5"><h2 class="course-category-title">Dubové taneční</h2><p>Kurzy připravujeme.</p></div>');
  assert.deepEqual([blocksOnly.recognized, blocksOnly.rowCount], [true, 0]);
});

test('small parsers', () => {
  assert.deepEqual(['PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO', 'NE'].map(parseDay), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(['pondělí', 'Úterý', 'středa', 'čtvrtek', 'PÁTEK', 'sobota', 'neděle', 'út.', 'Čt', 'xx', ''].map(parseDay), [1, 2, 3, 4, 5, 6, 7, 2, 4, null, null]);
  assert.deepEqual(parseTimeRange('18:15 - 19:45'), { start: '18:15', end: '19:45' });
  assert.deepEqual(parseTimeRange('pátek 20.00 – 22.00'), { start: '20:00', end: '22:00' });
  assert.deepEqual(parseTimeRange('8:00—9:30'), { start: '08:00', end: '09:30' });
  assert.equal(parseTimeRange('19:45 - 18:15'), null);
  assert.equal(parseTimeRange('25:00 - 26:00'), null);
  assert.equal(parseTimeRange('30.11.2026 - 25.1.2027'), null);
  assert.deepEqual(normalizeRoom(' Velký sál '), { room: 'velky', roomRaw: 'Velký sál' });
  assert.equal(normalizeRoom('MALÝ SÁL').room, 'maly');
  assert.equal(normalizeRoom('maly sal').room, 'maly');
  assert.equal(normalizeRoom('Velký nebo malý sál').room, null);
  assert.equal(normalizeRoom('').room, null);
  assert.equal(normalizeUrl('/tanecni-kurzy/dubove-tanecni#x'), `${BASE}/dubove-tanecni`);
  assert.equal(normalizeUrl('https://web.archive.org/web/20260714102046/https://www.tanecniskolaeso.cz/tanecni-kurzy/dubove-tanecni'), `${BASE}/dubove-tanecni`);
  assert.equal(normalizeUrl('https://evil.example/tanecni-kurzy/x'), null);
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(inferYear(11, 27, '2026-11-10', 5), '2026-11-27');
  assert.equal(inferYear(1, 8, '2026-11-10', 5), '2027-01-08');
  assert.equal(inferYear(11, 27, '2027-02-01', 5), null, 'a stale notice does not jump to the next year');
});

test('html tokenizer survives hostile and broken markup', () => {
  assert.equal(decodeEntities('1&nbsp;850&nbsp;K&#269; &amp; &#x161; &unknown;'), '1 850 Kč & š &unknown;');
  const tokens = tokenize('<p title="a > b">x<script>if (a < b) { document.write("<table>") }</script><!-- <table> -->y<br/>z <  3</p><td');
  assert.equal(textOf(tokens), 'x y z < 3');
  assert.equal(tokens.filter((t) => t.type === 'open' && t.name === 'table').length, 0);
});

test('real course page: note kept verbatim, Christmas closure parsed, holidays not double counted', () => {
  const detail = parseDetail(fixture('live', 'tanecni-kurzy_dubove-tanecni.html'), { today: TODAY });
  assert.deepEqual(detail.notes, [
    'Ve dnech 28. 10. a 17. 11. 2026 (státní svátky) lekce neprobíhají. O Vánocích (23. 12. 2026 až 2. 1. 2027 včetně) se netančí!',
  ]);
  assert.deepEqual(detail.closures, [{ from: '2026-12-23', to: '2027-01-02' }]);
  assert.deepEqual(detail.cancelled, ['2026-10-28', '2026-11-17']);
});

test('real tančírna page', () => {
  const t = parseTancirna(fixture('live', 'akce_tancirna-eso-original.html'), { today: TODAY });
  assert.equal(t.recognized, true);
  assert.deepEqual([t.weekday, t.start, t.end, t.room], [5, '20:00', '22:00', 'velky']);
  assert.deepEqual(t.skipDates, ['2026-11-27']);
  assert.ok(!t.skipDates.includes('2026-12-18'));
  assert.ok(!t.skipDates.includes('2027-01-08'));
  assert.deepEqual(t.closures, [{ from: '2026-12-23', to: '2027-01-02' }]);
  assert.deepEqual(t.warnings, []);
  assert.deepEqual(t.notes, [
    'pátek 20.00 - 22.00 ... pravidelně celý rok kromě Vánoc - tedy i o prázdninách (letních i jarních), i o státních svátcích, atd.',
    'přes Vánoce neprobíhají žádné tančírny (23. 12. 2026 až 2. 1. 2027 včetně)',
    '18. 12. 2026 a 8. 1. 2027 tančírna normálně běží!',
    'POZOR, 27. 11. tančírna není, místo toho vás zveme na ples:',
  ]);
});

test('tančírna page variants', () => {
  const page = (kdy, kde = 'Malý sál TŠ Eso') => `<main><h1>Tančírna</h1><table><tr><td><b>Kdy:</b></td><td>${kdy}</td></tr><tr><td>Kde:</td><td>${kde}</td></tr></table></main>`;
  const moved = parseTancirna(page('<p>sobota 19:30 – 21:30</p><p>Tančírna 4. 12. a 11. 12. 2026 odpadá.</p>'), { today: TODAY });
  assert.deepEqual([moved.weekday, moved.start, moved.end, moved.room], [6, '19:30', '21:30', 'maly']);
  assert.deepEqual(moved.skipDates, ['2026-12-04', '2026-12-11']);
  const mixed = parseTancirna(page('pátek 20.00 - 22.00<br>20. 11. tančírna není, ale 27. 11. normálně běží'), { today: TODAY });
  assert.deepEqual(mixed.skipDates, ['2026-11-20']);
  const unreadable = parseTancirna(page('každý týden večer', 'u nás'), { today: TODAY });
  assert.deepEqual([unreadable.weekday, unreadable.start, unreadable.room], [null, null, null]);
  assert.equal(unreadable.warnings.length, 3);
  assert.equal(parseTancirna('<main><h1>Stránka nenalezena</h1></main>', { today: TODAY }).recognized, false);
});

test('exception sentences', () => {
  const run = (text, opts = {}) => analyzeExceptions(text, { today: TODAY, ...opts });
  assert.deepEqual(run('18. 12. 2026 a 8. 1. 2027 tančírna normálně běží!', { allowWeak: true }), { cancelled: [], closures: [] });
  assert.deepEqual(run('POZOR, 27. 11. tančírna není, místo toho vás zveme na ples:', { allowWeak: true, weekday: 5 }).cancelled, ['2026-11-27']);
  assert.deepEqual(run('Dne 27. 11. není potřeba partner.').cancelled, [], '"není" alone is ignored outside the tančírna context');
  assert.deepEqual(run('O Vánocích (23. 12. 2026 až 2. 1. 2027 včetně) se netančí!').closures, [{ from: '2026-12-23', to: '2027-01-02' }]);
  assert.deepEqual(run('Od 23. 12. do 2. 1. je zavřeno.').closures, [{ from: '2026-12-23', to: '2027-01-02' }]);
  assert.deepEqual(run('Lekce se nekonají 21.12.2026 – 3.1.2027.').closures, [{ from: '2026-12-21', to: '2027-01-03' }]);
  assert.deepEqual(run('Kurz probíhá 30. 11. 2026 až 25. 1. 2027.'), { cancelled: [], closures: [] });
  assert.deepEqual(run('Výuka neprobíhá 1. 2. 2027 až 30. 6. 2027.').closures, [], 'implausibly long closures are ignored');
  assert.deepEqual(run('Lekce 1. 5. a 8. 5. 2027 odpadá.').cancelled, ['2027-05-01', '2027-05-08']);
  assert.deepEqual(run('Zvýhodněná cena za osobu do 12. 11. 2026'), { cancelled: [], closures: [] });
});

test('listing: traces of courses outside the known table markup are counted', () => {
  const live = parseListing(fixture('live', 'tanecni-kurzy.html'), { today: TODAY });
  assert.deepEqual([live.courses.length, live.markerCount, live.codeLikeCount, live.unparsedCodes.length], [12, 12, 12, 0]);
  assert.equal(live.mentions('26B471'), true);
  assert.equal(live.mentions('26B999'), false);
  const archive = parseListing(fixture('archive', 'tanecni-kurzy.html'), { today: '2026-07-14' });
  assert.deepEqual([archive.courses.length, archive.markerCount, archive.codeLikeCount, archive.unparsedCodes.length], [21, 21, 21, 0]);

  const divs = fixture('live', 'tanecni-kurzy.html').replace(/<(\/?)(table|thead|tbody|tr|td|th)\b/g, '<$1div');
  const redesigned = parseListing(divs, { today: TODAY });
  assert.deepEqual([redesigned.recognized, redesigned.courses.length, redesigned.rowCount, redesigned.markerCount, redesigned.codeLikeCount], [true, 0, 0, 12, 12]);

  const between = parseListing(fixture('live', 'tanecni-kurzy.html').replace(/<table\b.*?<\/table>/gs, '<p>Další kurzy začnou 8. 2. 2027, tel. 776 746 372, cena 1 990 Kč.</p>'), { today: TODAY });
  assert.deepEqual([between.recognized, between.courses.length, between.markerCount, between.codeLikeCount], [true, 0, 0, 0]);

  const extra = parseListing(fixture('live', 'tanecni-kurzy.html').replace('</main>', '<ul><li>27X12 pondělí</li></ul></main>'), { today: TODAY });
  assert.deepEqual(extra.unparsedCodes, ['27X12']);
});
