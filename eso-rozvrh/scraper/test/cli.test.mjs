import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { LISTING_URL, TANCIRNA_URL } from '../lib/parse.mjs';
import { fileNameForUrl, networkLoader, parseArgs, run } from '../scrape.mjs';
import { fixture, LIVE, TODAY } from './helpers.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scrape.mjs');

function workdir(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'eso-rozvrh-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function cli(args, env = {}) {
  const clean = { ...process.env, ...env };
  for (const key of ['GITHUB_OUTPUT', 'GITHUB_ACTIONS']) if (!(key in env)) delete clean[key];
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: clean });
}

const quiet = { log: () => {} };
const fixedNow = (iso) => new Date(iso);

test('cli: scrape from saved pages, then an unchanged second run', (t) => {
  const dir = workdir(t);
  const out = path.join(dir, 'data', 'schedule.json');
  const ghOutput = path.join(dir, 'gh-output');
  writeFileSync(ghOutput, '');

  const first = cli(['--from-dir', LIVE, '--out', out, '--today', TODAY], { GITHUB_OUTPUT: ghOutput });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Listing: 6 course tables, 12 rows, 12 parsed, 0 skipped/);
  assert.match(first.stdout, /Changed: true/);
  const text = readFileSync(out, 'utf8');
  const data = JSON.parse(text);
  assert.equal(text, `${JSON.stringify(data, null, 2)}\n`);
  assert.equal(data.courses.length, 12);
  assert.deepEqual(data.recurring[0].skipDates, ['2026-11-27']);
  assert.deepEqual(readdirSync(path.dirname(out)), ['schedule.json'], 'no temp file left behind');

  const second = cli(['--from-dir', LIVE, '--out', out, '--today', '2026-11-17'], { GITHUB_OUTPUT: ghOutput });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Changed: false/);
  const data2 = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(data2.updatedAt, data.updatedAt);
  assert.equal(data2.courses[0].lastSeen, '2026-11-17');
  assert.equal(readFileSync(ghOutput, 'utf8'), 'changed=true\nchanged=false\n');
});

test('cli: --dry-run prints and writes nothing', (t) => {
  const dir = workdir(t);
  const out = path.join(dir, 'schedule.json');
  const ghOutput = path.join(dir, 'gh-output');
  writeFileSync(ghOutput, '');
  const res = cli(['--from-dir', LIVE, '--out', out, '--today', TODAY, '--dry-run'], { GITHUB_OUTPUT: ghOutput });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /"code": "26B471"/);
  assert.deepEqual(readdirSync(dir), ['gh-output']);
  assert.equal(readFileSync(ghOutput, 'utf8'), '');
});

test('guard: broken listing -> non-zero exit, data file untouched', (t) => {
  const dir = workdir(t);
  const out = path.join(dir, 'schedule.json');
  assert.equal(cli(['--from-dir', LIVE, '--out', out, '--today', TODAY]).status, 0);
  const before = readFileSync(out, 'utf8');

  const pages = path.join(dir, 'pages');
  cpSync(LIVE, pages, { recursive: true });
  const cases = {
    'error page': '<html><body><h1>502 Bad Gateway</h1></body></html>',
    'empty response': '',
    'unknown table header': fixture('live', 'tanecni-kurzy.html').replaceAll('<th>Čas</th>', '<th>Hodina</th>'),
    'all rows unreadable': fixture('live', 'tanecni-kurzy.html').replace(/<td>\d+\.\d+\.\d+ - \d+\.\d+\.\d+<\/td>/g, '<td>již brzy</td>'),
  };
  for (const [name, html] of Object.entries(cases)) {
    writeFileSync(path.join(pages, 'tanecni-kurzy.html'), html);
    const ghOutput = path.join(dir, 'gh-output');
    writeFileSync(ghOutput, '');
    const res = cli(['--from-dir', pages, '--out', out, '--today', '2026-11-17'], { GITHUB_OUTPUT: ghOutput });
    assert.equal(res.status, 1, name);
    assert.match(res.stderr, /ERROR: /, name);
    assert.equal(readFileSync(out, 'utf8'), before, name);
    assert.equal(readFileSync(ghOutput, 'utf8'), '', name);
    assert.deepEqual(readdirSync(dir).sort(), ['gh-output', 'pages', 'schedule.json'], name);
  }

  // listing missing altogether (= fetch failure)
  rmSync(path.join(pages, 'tanecni-kurzy.html'));
  const res = cli(['--from-dir', pages, '--out', out, '--today', '2026-11-17']);
  assert.equal(res.status, 1);
  assert.equal(readFileSync(out, 'utf8'), before);
});

test('guard: valid listing with zero open courses -> ok, accumulated data kept', (t) => {
  const dir = workdir(t);
  const out = path.join(dir, 'schedule.json');
  assert.equal(cli(['--from-dir', LIVE, '--out', out, '--today', TODAY]).status, 0);
  const before = JSON.parse(readFileSync(out, 'utf8'));

  const pages = path.join(dir, 'pages');
  cpSync(LIVE, pages, { recursive: true });
  const variants = [
    fixture('live', 'tanecni-kurzy.html').replace(/<tbody>.*?<\/tbody>/gs, '<tbody></tbody>'),
    fixture('live', 'tanecni-kurzy.html').replace(/<table\b.*?<\/table>/gs, '<p>Kurzy připravujeme.</p>'),
  ];
  for (const html of variants) {
    writeFileSync(path.join(pages, 'tanecni-kurzy.html'), html);
    const res = cli(['--from-dir', pages, '--out', out, '--today', '2026-11-24']);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /0 parsed/);
    assert.match(res.stdout, /12 kept though no longer listed/);
    assert.match(res.stdout, /Changed: false/);
    const after = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual(after.courses, before.courses);
    assert.equal(after.updatedAt, before.updatedAt);
  }
});

test('guard: courses in a markup the parser does not know -> non-zero exit, data file untouched', (t) => {
  const dir = workdir(t);
  const out = path.join(dir, 'schedule.json');
  assert.equal(cli(['--from-dir', LIVE, '--out', out, '--today', TODAY]).status, 0);
  const before = readFileSync(out, 'utf8');
  const pages = path.join(dir, 'pages');
  cpSync(LIVE, pages, { recursive: true });
  // a redesign: the category blocks stay, the tables become <div>s
  const divs = fixture('live', 'tanecni-kurzy.html').replace(/<(\/?)(table|thead|tbody|tr|td|th)\b/g, '<$1div');
  // ...and one that also drops every class and data attribute; only the texts are left
  const bare = divs.replace(/\s(class|data-[a-z-]+)="[^"]*"/g, '').replace('<main', '<main class="course-category"');
  for (const html of [divs, bare]) {
    writeFileSync(path.join(pages, 'tanecni-kurzy.html'), html);
    for (const today of ['2026-11-17', '2027-06-07']) {
      const res = cli(['--from-dir', pages, '--out', out, '--today', today], { GITHUB_ACTIONS: 'true' });
      assert.equal(res.status, 1, res.stdout);
      assert.match(res.stderr, /no course could be read, but the page still carries traces of courses/);
      assert.match(res.stdout, /^::error title=eso-rozvrh scraper::/m);
      assert.equal(readFileSync(out, 'utf8'), before);
    }
  }
});

test('guard: a listing that stays empty is trusted only until the timetable has been empty for 45 days', async (t) => {
  const out = path.join(workdir(t), 'schedule.json');
  await run({ ...quiet, out, fromDir: LIVE, today: TODAY, now: fixedNow('2026-11-10T05:00:00Z') });
  const before = readFileSync(out, 'utf8');
  // the page as it looks between two cycles: category blocks, no tables, no course codes
  const empty = fixture('live', 'tanecni-kurzy.html').replace(/<table\b.*?<\/table>/gs, '<p>Kurzy připravujeme.</p>');
  const load = async (url) => (url === LISTING_URL ? empty : Promise.reject(new Error('HTTP 503')));
  const at = (today) => run({ ...quiet, out, load, today, now: fixedNow(`${today}T05:00:00Z`) });

  // the last known lesson is on 3. 2. 2027
  assert.deepEqual((await at('2027-02-03')).warnings.filter((w) => w.includes('listing')), []);
  const soon = await at('2027-02-10');
  assert.ok(soon.warnings.some((w) => w.includes('the listing has no courses and the last known lesson was on 2027-02-03')));
  assert.equal((await at('2027-03-20')).written, true, 'day 45 is still tolerated');
  const good = readFileSync(out, 'utf8');
  await assert.rejects(at('2027-03-21'), /the listing has no courses and the last known lesson was on 2027-02-03, 46 days ago/);
  await assert.rejects(at('2027-11-08'), /278 days ago/);
  assert.equal(readFileSync(out, 'utf8'), good, 'a refused run leaves the file (and its checkedAt) alone');
  assert.notEqual(good, before);

  // nothing listed and nothing known: an empty timetable is never written
  const blank = path.join(path.dirname(out), 'blank.json');
  await assert.rejects(run({ ...quiet, out: blank, load, today: TODAY }), /the data file has none either/);
  assert.throws(() => readFileSync(blank, 'utf8'), /ENOENT/);
});

test('optional pages get a small fetch budget and a shared deadline; the listing does not', async (t) => {
  const out = path.join(workdir(t), 'schedule.json');
  const calls = [];
  const load = async (url, page) => {
    calls.push({ url, page });
    if (url === LISTING_URL) return fixture('live', 'tanecni-kurzy.html');
    throw new Error('timeout');
  };
  const started = Date.now();
  const res = await run({ ...quiet, out, load, today: TODAY });
  assert.equal(res.schedule.courses.length, 12, 'a good listing is published although every other page hangs');
  assert.equal(calls[0].url, LISTING_URL);
  assert.equal(calls[0].page, undefined, 'full default budget');
  assert.equal(calls.length, 8, 'listing + tančírna + 6 category pages');
  assert.equal(calls[1].url, TANCIRNA_URL, 'the tančírna is asked first, before the budget can run out');
  for (const { page } of calls.slice(1)) {
    assert.deepEqual([page.attempts, page.timeoutMs], [2, 15000]);
    assert.equal(page.deadline, calls[1].page.deadline, 'one deadline for all of them');
    assert.ok(page.deadline - started >= 60000 && page.deadline - started <= 120000);
  }
});

test('partly unreadable listing: good rows are stored, run succeeds with warnings', async (t) => {
  const out = path.join(workdir(t), 'schedule.json');
  const html = fixture('live', 'tanecni-kurzy.html').replace('<td>18:15 - 19:45</td>', '<td>večer</td>').replace('data-kurz-nazev="26B471,', 'data-x="');
  const pages = { [LISTING_URL]: html };
  const load = async (url) => pages[url] ?? Promise.reject(new Error('HTTP 500'));
  const res = await run({ ...quiet, out, load, today: TODAY });
  assert.equal(res.schedule.courses.length, 11);
  assert.ok(res.warnings.some((w) => w.startsWith('skipped row: 26B471')));
});

test('tančírna or course pages failing do not fail the run and keep previous values', async (t) => {
  const out = path.join(workdir(t), 'schedule.json');
  await run({ ...quiet, out, fromDir: LIVE, today: TODAY, now: fixedNow('2026-11-10T05:00:00Z') });
  const before = JSON.parse(readFileSync(out, 'utf8'));

  const load = async (url) => {
    if (url === LISTING_URL) return fixture('live', 'tanecni-kurzy.html');
    if (url === TANCIRNA_URL) return '<html><body><main><h1>Stránka nenalezena</h1></main></body></html>';
    throw new Error('HTTP 503');
  };
  const res = await run({ ...quiet, out, load, today: '2026-11-17', now: fixedNow('2026-11-17T05:00:00Z') });
  assert.equal(res.changed, false);
  assert.equal(res.written, true);
  assert.ok(res.warnings.length >= 7);
  const after = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(after.recurring, before.recurring);
  assert.deepEqual(after.closures, before.closures);
  assert.deepEqual(after.notes, before.notes);
  assert.equal(after.checkedAt, '2026-11-17T05:00:00Z');
  assert.equal(after.updatedAt, '2026-11-10T05:00:00Z');
});

test('listing fetch failure rejects and leaves the file alone', async (t) => {
  const out = path.join(workdir(t), 'schedule.json');
  writeFileSync(out, '{"schemaVersion":1,"courses":[]}\n');
  await assert.rejects(run({ ...quiet, out, load: async () => Promise.reject(new Error('cannot fetch: ETIMEDOUT')), today: TODAY }), /listing: cannot fetch/);
  assert.equal(readFileSync(out, 'utf8'), '{"schemaVersion":1,"courses":[]}\n');
});

test('existing file: invalid JSON is rebuilt, a newer schema is refused', async (t) => {
  const out = path.join(workdir(t), 'schedule.json');
  writeFileSync(out, '{"schemaVersion": 1, "courses": [');
  const res = await run({ ...quiet, out, fromDir: LIVE, today: TODAY });
  assert.equal(res.changed, true);
  assert.ok(res.warnings.some((w) => w.includes('not valid JSON')));
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).courses.length, 12);

  writeFileSync(out, '{"schemaVersion": 2}\n');
  await assert.rejects(run({ ...quiet, out, fromDir: LIVE, today: TODAY }), /refusing to downgrade/);
  assert.equal(readFileSync(out, 'utf8'), '{"schemaVersion": 2}\n');
});

test('cli: one-off import of an archived listing', (t) => {
  const dir = workdir(t);
  const out = path.join(dir, 'schedule.json');
  assert.equal(cli(['--from-dir', LIVE, '--out', out, '--today', TODAY]).status, 0);
  const archive = path.join(path.dirname(LIVE), 'archive', 'tanecni-kurzy.html');
  const res = cli(['--import-listing', archive, '--seen', '2026-07-14', '--out', out, '--today', TODAY]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /21 courses parsed, 19 added/);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).courses.length, 31);
  assert.equal(cli(['--import-listing', archive, '--out', out]).status, 2);
});

test('arguments and file names', () => {
  assert.equal(fileNameForUrl(LISTING_URL), 'tanecni-kurzy.html');
  assert.equal(fileNameForUrl(`${LISTING_URL}/dubove-tanecni`), 'tanecni-kurzy_dubove-tanecni.html');
  assert.equal(fileNameForUrl(TANCIRNA_URL), 'akce_tancirna-eso-original.html');
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.throws(() => parseArgs(['--today', '10.11.2026']), /YYYY-MM-DD/);
  assert.throws(() => parseArgs(['--nonsense']), /unknown argument/);
  assert.throws(() => parseArgs(['--out']), /missing value/);
});

test('network loader: retries with backoff, gives up on 404, sends a User-Agent', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const html = (body) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  const calls = [];
  const fast = { backoffMs: [1], gapMs: 0, timeoutMs: 1000 };

  let failures = 2;
  globalThis.fetch = async (url, init) => {
    calls.push(init.headers['User-Agent']);
    if (failures-- > 0) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    return html('<p>ok</p>');
  };
  assert.equal(await networkLoader(fast)('https://example.test/'), '<p>ok</p>');
  assert.equal(calls.length, 3);
  assert.match(calls[0], /^eso-rozvrh-bot\/1\.0 \(\+https:\/\/eso-rozvrh\.paveldedik\.com\)$/);

  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return new Response('down', { status: 503 });
  };
  await assert.rejects(networkLoader(fast)('https://example.test/'), /cannot fetch .*HTTP 503/);
  assert.equal(count, 4);

  count = 0;
  globalThis.fetch = async () => {
    count++;
    return new Response('gone', { status: 404 });
  };
  await assert.rejects(networkLoader(fast)('https://example.test/'), /HTTP 404/);
  assert.equal(count, 1);

  // per-page budget: fewer attempts, a shorter timeout, a hard deadline
  count = 0;
  globalThis.fetch = async () => {
    count++;
    return new Response('down', { status: 503 });
  };
  await assert.rejects(networkLoader(fast)('https://example.test/', { attempts: 2 }), /HTTP 503/);
  assert.equal(count, 2);

  count = 0;
  await assert.rejects(networkLoader(fast)('https://example.test/', { attempts: 2, deadline: Date.now() - 1 }), /no time left/);
  assert.equal(count, 0, 'past the deadline nothing is requested');

  count = 0;
  const slow = { backoffMs: [60000], gapMs: 0, timeoutMs: 1000 };
  const began = Date.now();
  await assert.rejects(networkLoader(slow)('https://example.test/', { attempts: 2, deadline: Date.now() + 5000 }), /HTTP 503/);
  assert.equal(count, 1, 'no retry when the pause would end after the deadline');
  assert.ok(Date.now() - began < 2000);

  // a request is cut off at the deadline even when its own timeout is longer
  const signals = [];
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
    signals.push(init.signal);
    const keepAlive = setTimeout(() => {}, 10000); // the abort timer alone does not keep the event loop running
    init.signal.addEventListener('abort', () => {
      clearTimeout(keepAlive);
      reject(init.signal.reason);
    });
  });
  const hangStart = Date.now();
  await assert.rejects(networkLoader({ ...fast, timeoutMs: 60000 })('https://example.test/', { attempts: 2, timeoutMs: 30000, deadline: Date.now() + 1200 }), /cannot fetch/);
  assert.ok(Date.now() - hangStart < 3000, `took ${Date.now() - hangStart} ms`);
  assert.equal(signals.length, 1);
});
