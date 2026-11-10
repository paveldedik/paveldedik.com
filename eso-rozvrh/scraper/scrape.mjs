#!/usr/bin/env node
// Scrapes tanecniskolaeso.cz into ../site/data/schedule.json.
//
//   node scrape.mjs                      scrape the live site and update the data file
//   node scrape.mjs --dry-run            print the result, write nothing
//   node scrape.mjs --from-dir <dir>     read saved pages instead of the network (tests)
//   node scrape.mjs --out <file>         data file to read and write
//   node scrape.mjs --today YYYY-MM-DD   pretend it is another day (tests)
//   node scrape.mjs --import-listing <file.html> --seen YYYY-MM-DD
//                                        one-off: add courses from an old copy of the listing
//
// Exit code 0 = data file is up to date. Anything else = nothing was written
// and the previous (last good) file is still in place.
//
// The run fails (and so turns the scheduled workflow red) when the result
// cannot be trusted: the listing cannot be fetched or is not recognized, course
// codes are on the page but no course could be read, or the listing has been
// empty for so long that the timetable has had nothing in it for weeks.

import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { addDays, diffDays, isValidDate, todayInPrague } from './lib/dates.mjs';
import { buildSchedule, importListing, lastLessonDate, SCHEMA_VERSION, serialize } from './lib/merge.mjs';
import { LISTING_URL, parseDetail, parseListing, parseTancirna, TANCIRNA_URL } from './lib/parse.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, '../site/data/schedule.json');
const USER_AGENT = 'eso-rozvrh-bot/1.0 (+https://eso-rozvrh.paveldedik.com)';
const MAX_DETAIL_PAGES = 12;
// The listing is essential and gets the loader's full retry budget (about 2.7
// minutes at worst). The other pages are nice to have: one retry, a short
// timeout and one shared deadline, so that a slow site cannot push a run with a
// good listing over the time limit of the CI step.
const OPTIONAL_FETCH = { attempts: 2, timeoutMs: 15000 };
const OPTIONAL_BUDGET_MS = 90000;
// An empty listing is normal between two cycles. It stops being normal when the
// last lesson anybody knows about is this far in the past: courses are always
// announced weeks ahead, so by then the page has most likely changed in a way
// the parser does not see, and the timetable would show free halls for ever.
export const EMPTY_LISTING_GRACE_DAYS = 45;

class ScrapeError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseArgs(argv) {
  const opts = { dryRun: false, fromDir: null, out: DEFAULT_OUT, today: null, importListing: null, seen: null, help: false };
  const value = (i, flag) => {
    if (i >= argv.length) throw new ScrapeError(`missing value for ${flag}`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--from-dir') opts.fromDir = path.resolve(value(++i, arg));
    else if (arg === '--out') opts.out = path.resolve(value(++i, arg));
    else if (arg === '--today') opts.today = value(++i, arg);
    else if (arg === '--import-listing') opts.importListing = path.resolve(value(++i, arg));
    else if (arg === '--seen') opts.seen = value(++i, arg);
    else throw new ScrapeError(`unknown argument: ${arg}`);
  }
  for (const key of ['today', 'seen']) {
    if (opts[key] !== null && !isValidDate(opts[key])) throw new ScrapeError(`--${key} must be YYYY-MM-DD`);
  }
  if (opts.importListing && !opts.seen) throw new ScrapeError('--import-listing needs --seen YYYY-MM-DD');
  return opts;
}

/** https://host/akce/tancirna-eso-original -> akce_tancirna-eso-original.html */
export function fileNameForUrl(url) {
  const name = new URL(url).pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '_');
  return `${name || 'index'}.html`;
}

async function fetchOnce(url, timeoutMs) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'cs' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
    throw err;
  }
  const buffer = await res.arrayBuffer();
  const charset = /charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
  let decoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  return decoder.decode(buffer);
}

/**
 * Network loader: a few attempts with growing pauses, polite gap between requests.
 * load(url, { attempts, timeoutMs, deadline }) overrides the budget for one page;
 * `deadline` (epoch ms) is a hard stop: no attempt starts or lasts beyond it.
 */
export function networkLoader({ attempts = 4, backoffMs = [3000, 10000, 30000], timeoutMs = 30000, gapMs = 1000, log = () => {} } = {}) {
  let last = 0;
  return async (url, page = {}) => {
    const tries = page.attempts ?? attempts;
    const deadline = page.deadline ?? Infinity;
    let lastError;
    for (let attempt = 1; attempt <= tries; attempt++) {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      const left = deadline - Date.now();
      if (left < 1000) {
        lastError ??= new Error('no time left for optional pages');
        break;
      }
      try {
        const html = await fetchOnce(url, Math.min(page.timeoutMs ?? timeoutMs, left));
        last = Date.now();
        return html;
      } catch (err) {
        last = Date.now();
        lastError = err;
        const reason = err.cause?.code ?? err.cause?.message ?? err.message;
        log(`  attempt ${attempt}/${tries} failed for ${url}: ${reason}`);
        if (err.permanent || attempt === tries) break;
        const pause = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)];
        if (Date.now() + pause >= deadline) break;
        await sleep(pause);
      }
    }
    throw new Error(`cannot fetch ${url}: ${lastError?.cause?.code ?? lastError?.message}`);
  };
}

export function dirLoader(dir) {
  return async (url) => readFile(path.join(dir, fileNameForUrl(url)), 'utf8');
}

async function readPrevious(file, warn) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new ScrapeError(`cannot read ${file}: ${err.message}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    // A file that is not JSON is already broken for the site; rebuilding it is an improvement.
    warn(`existing ${file} is not valid JSON (${err.message}); starting from scratch`);
    return null;
  }
  if (data && typeof data === 'object' && Number.isInteger(data.schemaVersion) && data.schemaVersion > SCHEMA_VERSION) {
    throw new ScrapeError(`${file} has schemaVersion ${data.schemaVersion}, this scraper writes ${SCHEMA_VERSION}; refusing to downgrade`);
  }
  return data;
}

async function writeAtomic(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

function checkListing(listing, what) {
  if (!listing.recognized) {
    throw new ScrapeError(`${what} does not look like the course listing (no course tables, no course categories) - the site has probably changed`);
  }
  if (listing.rowCount > 0 && listing.courses.length === 0) {
    throw new ScrapeError(`${what}: found ${listing.rowCount} course rows but none could be parsed - the site has probably changed`);
  }
  // No course tables at all is what the page looks like between two cycles -
  // unless the courses are there in a markup this parser does not know.
  if (listing.courses.length === 0 && (listing.markerCount > 0 || listing.codeLikeCount >= 2)) {
    throw new ScrapeError(`${what}: no course could be read, but the page still carries traces of courses ` +
      `(${listing.markerCount} course badges / cart links, ${listing.codeLikeCount} course codes in the text) - the site has probably changed`);
  }
}

/** Courses that are on the page but not in the result (a table in a new markup next to the known ones). */
function unparsedWarning(listing) {
  const codes = listing.unparsedCodes ?? [];
  if (listing.courses.length === 0 || codes.length === 0) return null;
  return `the listing mentions ${codes.length} course code(s) that could not be read as a course: ${codes.slice(0, 12).join(', ')}`;
}

/**
 * An empty listing is trusted only while the data still has something to show.
 * Based on lesson dates alone, i.e. on what is committed in the data file.
 */
function checkEmptyListing(listing, schedule, today, warn) {
  if (listing.courses.length > 0) return;
  const last = lastLessonDate(schedule);
  if (last === null) {
    throw new ScrapeError('the listing has no courses and the data file has none either - nothing to show; the site has probably changed');
  }
  if (last < addDays(today, -EMPTY_LISTING_GRACE_DAYS)) {
    throw new ScrapeError(`the listing has no courses and the last known lesson was on ${last}, ${diffDays(today, last)} days ago ` +
      `(limit ${EMPTY_LISTING_GRACE_DAYS}) - the site has probably changed in a way the scraper does not see`);
  }
  if (last < today) {
    warn(`the listing has no courses and the last known lesson was on ${last}; the timetable is empty from now on ` +
      `(the run starts failing ${EMPTY_LISTING_GRACE_DAYS} days after that date)`);
  }
}

/**
 * Runs one scrape. Returns { schedule, changed, written, warnings, stats }.
 * Throws ScrapeError (without touching the data file) when the result cannot be trusted.
 */
export async function run(options = {}) {
  const log = options.log ?? console.log;
  const warnings = [];
  const warn = (message) => {
    warnings.push(message);
    log(`WARNING: ${message}`);
  };
  const out = options.out ?? DEFAULT_OUT;
  const now = options.now ?? new Date();
  const today = options.today ?? todayInPrague(now);
  const nowIso = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const prevRaw = await readPrevious(out, warn);

  let result;
  if (options.importListing) {
    const html = await readFile(options.importListing, 'utf8').catch((err) => {
      throw new ScrapeError(`cannot read ${options.importListing}: ${err.message}`);
    });
    const listing = parseListing(html, { today: options.seen });
    listing.warnings.forEach(warn);
    checkListing(listing, options.importListing);
    const unparsed = unparsedWarning(listing);
    if (unparsed) warn(unparsed);
    result = importListing({ prevRaw, listing, seenDate: options.seen, today, nowIso });
    result.warnings.forEach(warn);
    log(`Imported listing as of ${options.seen}: ${listing.courses.length} courses parsed, ` +
      `${result.stats.added.length} added (${result.stats.added.join(', ') || '-'}), ` +
      `${result.stats.skipped.length} already known and left alone (${result.stats.skipped.join(', ') || '-'})`);
  } else {
    const load = options.load ?? (options.fromDir ? dirLoader(options.fromDir) : networkLoader({ log }));

    // 1. The listing: without it there is nothing to do, so failure here is fatal.
    let listingHtml;
    try {
      listingHtml = await load(LISTING_URL);
    } catch (err) {
      throw new ScrapeError(`listing: ${err.message}`);
    }
    const listing = parseListing(listingHtml, { today });
    listing.warnings.forEach(warn);
    checkListing(listing, LISTING_URL);
    const unparsed = unparsedWarning(listing);
    if (unparsed) warn(unparsed);

    // 2. The tančírna page and the category pages (notes, closures): nice to have, never
    //    fatal, on a small shared time budget. The tančírna goes first - its cancelled
    //    Fridays matter most if the budget runs out.
    const optional = { ...OPTIONAL_FETCH, deadline: Date.now() + (options.optionalBudgetMs ?? OPTIONAL_BUDGET_MS) };
    let tancirna = { ok: false };
    try {
      const prevWeekday = prevRaw?.recurring?.find?.((r) => r?.id === 'tancirna')?.weekday;
      const parsed = parseTancirna(await load(TANCIRNA_URL, optional), { today, weekdayHint: Number.isInteger(prevWeekday) ? prevWeekday : 5 });
      parsed.warnings.forEach(warn);
      if (parsed.recognized) tancirna = { ok: true, ...parsed };
      else warn('tančírna page does not mention a tančírna at all; keeping the last known values');
    } catch (err) {
      warn(`tančírna page skipped (${err.message}); keeping the last known values`);
    }
    const urls = [...new Set([...listing.courses.map((c) => c.url), ...listing.categoryUrls])]
      .filter((url) => url !== LISTING_URL)
      .slice(0, MAX_DETAIL_PAGES);
    const details = new Map();
    for (const url of urls) {
      try {
        details.set(url, { ok: true, ...parseDetail(await load(url, optional), { today }) });
      } catch (err) {
        details.set(url, { ok: false });
        warn(`course page skipped (${err.message}); keeping what was known about it`);
      }
    }

    result = buildSchedule({ prevRaw, listing, details, tancirna, today, nowIso });
    result.warnings.forEach(warn);
    checkEmptyListing(listing, result.schedule, today, warn);
    const s = result.stats;
    log(`Listing: ${listing.tableCount} course tables, ${listing.rowCount} rows, ${listing.courses.length} parsed, ${listing.failedCount} skipped`);
    log(`Courses: ${result.schedule.courses.length} in the data file ` +
      `(${s.added.length} new${s.added.length ? `: ${s.added.join(', ')}` : ''}; ` +
      `${s.updated.length} updated${s.updated.length ? `: ${s.updated.join(', ')}` : ''}; ` +
      `${s.kept} kept though no longer listed; ` +
      `${s.pruned.length} pruned${s.pruned.length ? `: ${s.pruned.join(', ')}` : ''}; ` +
      `${s.withdrawn.length} withdrawn before the start${s.withdrawn.length ? `: ${s.withdrawn.join(', ')}` : ''})`);
    if (s.moved.length) log(`Rescheduled by the school (same code, new dates replace the old ones): ${s.moved.join(', ')}`);
    log(`Pages: ${[...details.values()].filter((d) => d.ok).length}/${details.size} course pages, tančírna ${tancirna.ok ? 'ok' : 'FAILED'}`);
  }

  const { schedule, changed } = result;
  const t = schedule.recurring.find((r) => r.id === 'tancirna');
  if (t) log(`Tančírna: weekday ${t.weekday} ${t.start}-${t.end}, room ${t.room}, skipDates [${t.skipDates.join(', ')}]`);
  log(`Closures: ${schedule.closures.map((c) => `${c.from}..${c.to}`).join(', ') || '-'}`);
  log(`Notes: ${schedule.notes.length}`);
  log(`Changed: ${changed} (checkedAt ${schedule.checkedAt}, updatedAt ${schedule.updatedAt})`);

  let written = false;
  if (options.dryRun) {
    log('Dry run - nothing written. Result:');
    log(serialize(schedule));
  } else {
    await writeAtomic(out, serialize(schedule));
    written = true;
    log(`Wrote ${out}`);
  }
  return { schedule, changed, written, warnings, stats: result.stats };
}

async function main() {
  const actions = process.env.GITHUB_ACTIONS === 'true';
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    return 2;
  }
  if (opts.help) {
    console.log('Usage: node scrape.mjs [--dry-run] [--from-dir <dir>] [--out <file>] [--today YYYY-MM-DD]\n' +
      '       node scrape.mjs --import-listing <file.html> --seen YYYY-MM-DD [--dry-run] [--out <file>]');
    return 0;
  }
  try {
    const { changed, warnings } = await run({ ...opts, today: opts.today ?? undefined });
    if (actions) for (const w of warnings) console.log(`::warning title=eso-rozvrh scraper::${w.replace(/\r?\n/g, ' ')}`);
    if (process.env.GITHUB_OUTPUT && !opts.dryRun) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    return 0;
  } catch (err) {
    const message = err instanceof ScrapeError ? err.message : err.stack ?? String(err);
    console.error(`ERROR: ${message}`);
    console.error('The data file was NOT modified; the site keeps showing the last good data.');
    if (actions) console.log(`::error title=eso-rozvrh scraper::${String(err.message).replace(/\r?\n/g, ' ')}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
