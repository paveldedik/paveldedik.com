// UI for the Eso hall timetable. All data-derived strings go through
// textContent / setAttribute (never innerHTML): the JSON is scraped from a
// third-party site and is treated as untrusted. Pure logic lives in lib.js.

import {
  DAY_NAMES, DAY_SHORT, addDays, mondayOf, isoWeek, isYmd, diffDays, pragueNow,
  fmtTime, fmtTimeRange, fmtDate, fmtDayMonth, fmtDateRange, fmtDateList, fmtInstant, fmtFree,
  normalizeData, buildWeek, nextCourseWeek, weekHasCourses, visibleRange, makeScale,
  shortTitle, skippedDates, googleSingleUrl, googleSeriesUrl, googleSeriesParts, courseIcs, recurringIcs,
  fileSlug, dataHorizon,
} from './lib.js';

const DATA_URL = 'data/schedule.json';
const STALE_DAYS = 21;
const BAND_PX = 40;
// Height of the time track on paper: the whole board has to fit one A4 landscape page.
const PRINT_TRACK_PX = 480;

const $ = (id) => document.getElementById(id);
const narrow = window.matchMedia('(max-width: 1023px)');

const state = {
  data: null,
  horizon: null, // see dataHorizon() in lib.js
  monday: null, // Monday of the displayed week
  day: null, // selected day (drives the one-day view on small screens)
  hall: 'all',
  view: 'compact',
};
let current = null; // { scale, range } of the last render, for the "now" line
let lastToday = null;

/* ---------- tiny DOM helper ---------- */

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  add(el, ...kids);
  return el;
}

/** Appends children, skipping null/false and flattening nested arrays. */
function add(el, ...kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid);
  }
}

function put(el, ...kids) {
  el.replaceChildren();
  add(el, ...kids);
}

/**
 * Vertical length on the time axis. Everything positioned along the track uses
 * the --k unit (1px on screen, less on paper) so print can shrink the time
 * scale without shrinking the type.
 */
const u = (v) => `calc(${Number(v.toFixed(2))} * var(--k, 1px))`;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function pref(key, value) {
  try {
    if (value === undefined) return window.localStorage.getItem(`eso-rozvrh:${key}`);
    window.localStorage.setItem(`eso-rozvrh:${key}`, value);
  } catch { /* private mode etc. - preferences are optional */ }
  return null;
}

/* ---------- boot ---------- */

async function boot() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Server vrátil chybu ${res.status}.`);
    let raw;
    try {
      raw = await res.json();
    } catch {
      throw new Error('Datový soubor se nepodařilo přečíst.');
    }
    state.data = normalizeData(raw);
    state.horizon = dataHorizon(state.data);
  } catch (err) {
    showError(err);
    return;
  }

  const data = state.data;
  if (pref('view') === 'full') state.view = 'full';
  const savedHall = pref('hall');
  if (savedHall && data.rooms.some((r) => r.id === savedHall)) state.hall = savedHall;

  const today = pragueNow().date;
  const start = readHash() || today;
  state.day = start;
  state.monday = mondayOf(start);

  renderStatic();
  bind();
  $('status').hidden = true;
  $('app').hidden = false;
  render();
  window.setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

function showError(err) {
  const box = $('status');
  box.className = 'state state--error';
  const detail = err instanceof TypeError ? 'Zkontrolujte připojení k internetu.' : (err && err.message) || '';
  put(box,
    h('p', { class: 'state__title', text: 'Rozvrh se nepodařilo načíst' }),
    h('p', { text: `${detail} Zkuste to prosím za chvíli znovu.`.trim() }),
    h('p', {},
      h('button', { type: 'button', class: 'btn btn--primary', id: 'retry', text: 'Zkusit znovu' }),
      ' ',
      h('a', {
        class: 'btn', href: 'https://www.tanecniskolaeso.cz/tanecni-kurzy',
        target: '_blank', rel: 'noopener noreferrer', text: 'Kurzy na tanecniskolaeso.cz',
      })),
  );
  $('retry').addEventListener('click', () => window.location.reload());
}

function readHash() {
  const m = /^#(\d{4}-\d{2}-\d{2})$/.exec(window.location.hash);
  return m && isYmd(m[1]) ? m[1] : null;
}

function writeHash() {
  const today = pragueNow().date;
  const isHome = narrow.matches ? state.day === today : state.monday === mondayOf(today);
  const target = isHome ? '' : `#${narrow.matches ? state.day : state.monday}`;
  if (window.location.hash === target) return;
  try {
    window.history.replaceState(null, '', target || window.location.pathname + window.location.search);
  } catch { /* file:// or sandboxed - deep links are optional */ }
}

/* ---------- navigation ---------- */

function go(deltaDays) {
  state.day = addDays(state.day, deltaDays);
  state.monday = mondayOf(state.day);
  render();
}

function goTo(date) {
  state.day = date;
  state.monday = mondayOf(date);
  render();
}

function bind() {
  $('prev').addEventListener('click', () => go(-7));
  $('next').addEventListener('click', () => go(7));
  $('today').addEventListener('click', () => goTo(pragueNow().date));

  $('view-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    state.view = btn.dataset.view === 'full' ? 'full' : 'compact';
    pref('view', state.view);
    render();
  });
  $('hall-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-hall]');
    if (!btn) return;
    state.hall = btn.dataset.hall;
    pref('hall', state.hall);
    render();
  });

  window.addEventListener('hashchange', () => {
    const d = readHash();
    if (d) goTo(d);
  });
  narrow.addEventListener('change', render);
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(fitEvents, 120);
  });

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if ($('detail').open) return;
    const t = e.target;
    if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const step = narrow.matches ? 1 : 7;
    if (e.key === 'ArrowLeft') { go(-step); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { go(step); e.preventDefault(); }
    else if (e.key === 'd' || e.key === 'D') goTo(pragueNow().date);
  });

  // Swipe between days in the one-day (phone) view.
  const board = $('rozvrh');
  let touch = null;
  board.addEventListener('touchstart', (e) => {
    touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  board.addEventListener('touchend', (e) => {
    if (!touch || !narrow.matches) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }, { passive: true });

  const dialog = $('detail');
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}

function tick() {
  if (pragueNow().date !== lastToday) render();
  else placeNow();
}

/* ---------- static parts (rendered once) ---------- */

function renderStatic() {
  const data = state.data;

  // Hall filter
  const halls = $('hall-filter');
  put(halls,
    h('button', { type: 'button', 'data-hall': 'all', text: data.rooms.length === 2 ? 'Oba sály' : 'Všechny sály' }),
    data.rooms.map((r) => h('button', { type: 'button', 'data-hall': r.id, text: r.name })),
  );
  halls.hidden = data.rooms.length < 2;

  // Legend
  const seen = new Map();
  for (const c of data.courses) {
    if (!seen.has(c.category)) seen.set(c.category, { hue: c.hue, label: c.category, level: c.level });
  }
  const items = [...seen.values()].sort((a, b) => a.hue - b.hue || a.label.localeCompare(b.label, 'cs'));
  for (const r of data.recurring) {
    if (!seen.has(r.title)) { seen.set(r.title, true); items.push({ hue: r.hue, label: r.title, level: null }); }
  }
  put($('legend'),
    items.map((it) => h('li', {},
      h('span', { class: `swatch hue-${it.hue}`, 'aria-hidden': 'true' }),
      h('span', { text: it.label }),
      it.level && h('span', { class: 'legend__level', text: it.level }))),
    h('li', {}, h('span', { class: 'swatch swatch--free', 'aria-hidden': 'true' }), h('span', { text: 'volno (není vypsaný kurz)' })),
    state.horizon !== null &&
      h('li', {}, h('span', { class: 'swatch swatch--maybe', 'aria-hidden': 'true' }),
        h('span', { text: 'volno? (kurzy na to období ještě nejsou vypsané)' })),
    data.closures.length > 0 &&
      h('li', {}, h('span', { class: 'swatch swatch--closed', 'aria-hidden': 'true' }), h('span', { text: 'zavřeno' })),
  );

  // Notes from the school's pages, verbatim
  if (data.notes.length) {
    put($('notes-list'), data.notes.map((n) => h('li', {},
      h('span', { text: n.text }),
      n.source && [' ', h('a', { href: n.source, target: '_blank', rel: 'noopener noreferrer', class: 'notes__src', text: 'zdroj' })])));
    $('notes').hidden = false;
  }

  $('source-link').setAttribute('href', data.source);

  // Freshness
  const today = pragueNow().date;
  const checked = data.checkedAt && fmtInstant(data.checkedAt);
  const updated = data.updatedAt && fmtInstant(data.updatedAt);
  const meta = $('checked');
  if (checked) {
    meta.textContent = `Data naposledy ověřena: ${checked.text}.`;
    if (updated && updated.date !== checked.date) meta.textContent += ` Poslední změna v nabídce: ${fmtDate(updated.date)}.`;
    if (diffDays(today, checked.date) > STALE_DAYS) {
      const stale = $('stale');
      put(stale,
        h('strong', { text: 'Data se delší dobu nepodařilo aktualizovat.' }),
        ` Naposledy byla ověřena ${fmtDate(checked.date)}, rozvrh proto nemusí odpovídat aktuální nabídce kurzů.`);
      stale.hidden = false;
    }
  } else {
    meta.textContent = 'Datum posledního ověření dat není známé.';
  }
}

/* ---------- week render ---------- */

function visibleRooms() {
  const { rooms } = state.data;
  return state.hall === 'all' ? rooms : rooms.filter((r) => r.id === state.hall);
}

function render() {
  const data = state.data;
  const today = pragueNow().date;
  lastToday = today;
  const week = buildWeek(data, state.monday, state.horizon);

  // The grid is rebuilt from scratch; remember where keyboard focus was.
  const active = document.activeElement;
  const focusLost = active instanceof HTMLElement && active !== $('rozvrh') &&
    ($('rozvrh').contains(active) || $('unassigned').contains(active));
  const focusKey = focusLost ? active.dataset.ev : null;

  // Time range is computed from every hall so toggling the filter does not make the axis jump.
  const all = week.days.flatMap((d) => d.rooms.flatMap((r) => r.events));
  const range = visibleRange(all, state.view);
  // Compact view is roomy; if events force a long visible stretch anyway, tighten it.
  const hours = (range.end - range.fitStart) / 60;
  const hourPx = state.view === 'compact' ? Math.round(Math.max(46, Math.min(76, 640 / hours))) : 46;
  const scale = makeScale(range, hourPx, BAND_PX);
  current = { scale, range };
  current.printK = Math.min(1, PRINT_TRACK_PX / scale.height);
  $('rozvrh').style.setProperty('--print-k', `${current.printK.toFixed(3)}px`);

  $('week-range').textContent = fmtDateRange(week.monday, week.sunday);
  $('week-no').textContent = `${isoWeek(week.monday)}. týden`;
  document.title = `${fmtDateRange(week.monday, week.sunday)} · Rozvrh sálů – Taneční škola Eso`;
  $('today').setAttribute('aria-pressed', String(state.monday === mondayOf(today)));

  for (const b of $('view-filter').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
  }
  for (const b of $('hall-filter').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.hall === state.hall));
  }

  renderJump(week);
  renderDayTabs(week, today);
  renderBoard(week, scale, range, today);
  renderUnassigned(week);
  fitEvents();
  placeNow();
  writeHash();

  if (focusLost) {
    const same = focusKey &&
      [...document.querySelectorAll('#rozvrh [data-ev], #unassigned [data-ev]')]
        .find((el) => el.dataset.ev === focusKey && el.offsetParent !== null);
    (same || $('rozvrh')).focus({ preventScroll: true });
  }
}

/**
 * Cards are fixed-height boxes on the time axis; when the text does not fit
 * (narrow columns, long names) drop the least important lines instead of
 * letting them be cut in half.
 */
function fitEvents() {
  const cards = [...document.querySelectorAll('#rozvrh .ev')].filter((el) => el.offsetParent !== null);
  for (const el of cards) el.classList.remove('ev--nocode', 'ev--nometa', 'ev--clamp');
  const over = (el) => el.scrollHeight > el.clientHeight + 1;
  let left = cards;
  for (const cls of ['ev--nocode', 'ev--nometa', 'ev--clamp']) {
    left = left.filter(over); // one read pass, then one write pass per step
    for (const el of left) el.classList.add(cls);
  }
}

function renderJump(week) {
  const data = state.data;
  const box = $('jump');
  box.replaceChildren();
  box.hidden = true;
  if (weekHasCourses(data, week.monday)) {
    // The tail of a cycle: some courses still run, the next ones are not published yet.
    // (The phone shows one day at a time, so only speak up when that day is affected.)
    const shown = narrow.matches ? week.days.filter((d) => d.date === state.day) : week.days;
    if (shown.some((d) => d.tentative)) {
      box.append(h('span', {
        text: 'Kurzy na další období škola nejspíš ještě nevypsala. Šrafované „volno?“ je proto jen předběžné – sál se může zaplnit, až škola nové kurzy vypíše.',
      }));
      box.hidden = false;
    }
    return;
  }
  const next = nextCourseWeek(data, week.monday);
  if (next) {
    const first = data.courses.flatMap((c) => c.dates).filter((d) => d >= next).sort()[0];
    box.append(
      h('span', { text: 'V tomto týdnu není vypsaný žádný kurz.' }),
      h('button', { type: 'button', class: 'btn btn--primary', id: 'jump-btn' },
        h('span', { text: 'Nejbližší týden s kurzy' }),
        h('span', { class: 'btn__sub', text: fmtDateRange(next, addDays(next, 6)) })));
    box.hidden = false;
    $('jump-btn').addEventListener('click', () => {
      goTo(narrow.matches && first ? first : next);
      $('rozvrh').focus({ preventScroll: true });
    });
  } else if (week.sunday >= pragueNow().date) {
    box.append(h('span', {
      text: 'Na tento týden zatím není vypsaný žádný kurz. Nové kurzy se tu objeví, jakmile je škola vypíše.',
    }));
    box.hidden = false;
  }
}

function renderDayTabs(week, today) {
  const nav = $('daytabs');
  const hadFocus = nav.contains(document.activeElement);
  put(nav, week.days.map((day) => {
    const btn = h('button', {
      type: 'button',
      class: `daytab${day.date === today ? ' is-today' : ''}${day.closure ? ' is-closed' : ''}`,
      'aria-pressed': String(day.date === state.day),
      'aria-label': `${cap(DAY_NAMES[day.weekday - 1])} ${fmtDayMonth(day.date)}${day.count ? `, akcí: ${day.count}` : ', bez akcí'}`,
    },
    h('span', { class: 'daytab__dow', text: DAY_SHORT[day.weekday - 1] }),
    h('span', { class: 'daytab__num', text: String(Number(day.date.slice(8))) }),
    h('span', { class: `daytab__dot${day.count ? ' is-on' : ''}`, 'aria-hidden': 'true' }));
    btn.addEventListener('click', () => goTo(day.date));
    return btn;
  }));
  if (hadFocus) {
    const sel = nav.querySelector('[aria-pressed="true"]');
    if (sel) sel.focus({ preventScroll: true });
  }
}

function renderBoard(week, scale, range, today) {
  const rooms = visibleRooms();
  const grid = h('div', { class: `week${rooms.length === 1 ? ' week--single' : ''}` });
  grid.append(buildAxis(scale, range));
  for (const day of week.days) grid.append(buildDay(day, rooms, scale, range, today));
  $('rozvrh').replaceChildren(grid);
}

function buildAxis(scale, range) {
  const track = h('div', { class: 'axis__track' });
  track.style.height = u(scale.height);
  const tick = (m, extra) => {
    const el = h('span', { class: `axis__tick${extra || ''}`, text: fmtTime(m) });
    el.style.top = u(scale.y(m));
    track.append(el);
  };
  if (scale.band) {
    tick(range.start, ' axis__tick--first');
    const gap = h('span', {
      class: 'axis__gap',
      title: `Úsek ${fmtTimeRange(range.start, range.fitStart)} je zkrácený`,
      'aria-hidden': 'true',
      text: '⋮',
    });
    gap.style.top = u(scale.band / 2);
    track.append(gap);
  }
  for (const m of scale.ticks) tick(m, m === range.start ? ' axis__tick--first' : '');
  return h('div', { class: 'axis', 'aria-hidden': 'true' },
    h('div', { class: 'axis__head' }),
    track,
    h('div', { class: 'axis__foot' }, h('span', { text: 'volno' })));
}

function buildDay(day, rooms, scale, range, today) {
  const name = cap(DAY_NAMES[day.weekday - 1]);
  const cls = ['day'];
  if (day.date === today) cls.push('is-today');
  if (day.date < today) cls.push('is-past');
  if (day.closure) cls.push('is-closed');
  if (day.tentative) cls.push('is-tentative');
  if (day.date === state.day) cls.push('is-selected');

  const head = h('h3', { class: 'day__head' },
    h('span', { class: 'day__dow', text: name }),
    h('span', { class: 'day__date', text: fmtDayMonth(day.date) }),
    day.date === today && h('span', { class: 'visually-hidden', text: ' (dnes)' }),
    day.closure
      ? h('span', { class: 'tag tag--closed', text: `zavřeno – ${day.closure.label}` })
      : day.holiday && h('span', { class: 'tag tag--holiday', title: day.holiday, text: 'svátek' }),
    day.tentative && h('span', { class: 'visually-hidden', text: ' – kurzy na tento den nejspíš ještě nejsou vypsané' }));

  const halls = h('div', { class: 'day__halls' });
  for (const r of day.rooms) {
    if (!rooms.includes(r.room)) continue;
    halls.append(buildHall(day, r, scale, range));
  }
  return h('section', { class: cls.join(' '), 'data-date': day.date, 'aria-label': `${name} ${fmtDate(day.date)}` }, head, halls);
}

function buildHall(day, r, scale, range) {
  const track = h('div', { class: 'track' });
  track.style.height = u(scale.height);

  for (const m of scale.ticks) {
    if (m === range.start || m === range.end) continue;
    const line = h('span', { class: `line${m === range.fitStart && scale.band ? ' line--band' : ''}`, 'aria-hidden': 'true' });
    line.style.top = u(scale.y(m));
    track.append(line);
  }

  const closed = Boolean(day.closure);
  const maybe = day.tentative;
  if (closed) {
    // A closed day stays closed around a stray event; only the label gives way to it.
    track.append(h('div', { class: 'closed' },
      !r.events.length && h('span', { class: 'closed__label' },
        h('strong', { text: 'zavřeno' }), h('span', { text: day.closure.label }))));
  } else {
    for (const w of r.free) {
      const top = scale.y(w.start);
      const height = scale.y(w.end) - top;
      if (height < 3) continue;
      const el = h('div', {
        class: `free${maybe ? ' free--maybe' : ''}${height * current.printK < 34 ? ' free--ptight' : ''}`,
        title: maybe ? `Předběžně volno ${fmtFree(w)} – kurzy na toto období ještě nejsou vypsané` : `Volno ${fmtFree(w)}`,
        'aria-hidden': 'true',
      });
      el.style.top = u(top);
      el.style.height = u(height);
      const word = maybe ? 'volno?' : 'volno';
      if (height >= 44) el.append(h('span', { class: 'free__label' }, h('strong', { text: word }), h('span', { text: fmtFree(w) })));
      else if (height >= 17) el.append(h('span', { class: 'free__label free__label--s', text: word }));
      track.append(el);
    }
  }

  for (const ev of r.events) track.append(buildEvent(ev, r.room, scale));

  const foot = h('div', { class: 'hall__foot' });
  if (closed) {
    foot.append(h('p', { class: 'foot__closed', text: 'zavřeno' }));
  } else {
    add(foot,
      h('p', { class: 'foot__label', text: maybe ? 'Předběžně volno (kurzy ještě nejsou vypsané)' : 'Volno' }),
      h('ul', { class: `foot__list${maybe ? ' foot__list--maybe' : ''}` }, r.free.map((w) => h('li', { text: fmtFree(w) }))),
      !r.free.length && h('p', { class: 'foot__closed', text: 'celý den obsazeno' }));
  }

  return h('div', { class: 'hall', 'data-room': r.room.id, role: 'group', 'aria-label': r.room.name },
    h('div', { class: 'hall__head', text: r.room.name }),
    track,
    foot);
}

function buildEvent(ev, room, scale) {
  const ref = ev.ref;
  const top = scale.y(ev.start);
  const height = Math.max(18, scale.y(ev.end) - top);
  const time = fmtTimeRange(ev.start, ev.end);
  const label = [
    ref.category,
    `${DAY_NAMES[(diffDays(ev.date, mondayOf(ev.date)))]} ${fmtDayMonth(ev.date)} ${time}`,
    room && room.name,
    ref.lecturer && `lektor ${ref.lecturer}`,
  ].filter(Boolean).join(', ');
  const size = height < 46 ? ' ev--xs' : height < 78 ? ' ev--s' : '';
  const paper = height * current.printK < 70 ? ' ev--ptight' : '';
  const btn = h('button', {
    type: 'button',
    class: `ev hue-${ref.hue}${size}${paper}${ev.lanes > 1 ? ' ev--lane' : ''}`,
    'data-ev': `${ref.key}@${ev.date}`,
    'aria-label': `${label}. Zobrazit podrobnosti`,
    'aria-haspopup': 'dialog',
  },
  h('span', { class: 'ev__time', text: time }),
  h('span', { class: 'ev__title', text: shortTitle(ref.category) }),
  ref.lecturer && h('span', { class: 'ev__meta', text: ref.lecturer }),
  ref.code && h('span', { class: 'ev__code', text: ref.code }));
  btn.style.top = u(top);
  btn.style.height = `max(18px, ${u(height)})`;
  btn.style.left = `${(ev.lane / ev.lanes) * 100}%`;
  btn.style.width = `${100 / ev.lanes}%`;
  btn.addEventListener('click', () => openDetail(ev));
  return btn;
}

function renderUnassigned(week) {
  const list = $('unassigned-list');
  const items = [];
  for (const day of week.days) {
    for (const ev of day.unassigned) {
      const btn = h('button', {
        type: 'button', class: `chip hue-${ev.ref.hue}`, 'aria-haspopup': 'dialog', 'data-ev': `${ev.ref.key}@${ev.date}`,
      },
        h('strong', { text: `${DAY_SHORT[day.weekday - 1]} ${fmtDayMonth(day.date)} ${fmtTimeRange(ev.start, ev.end)}` }),
        h('span', { text: ev.ref.category }),
        ev.ref.roomRaw && h('span', { class: 'chip__muted', text: `místo: ${ev.ref.roomRaw}` }));
      btn.addEventListener('click', () => openDetail(ev));
      items.push(h('li', {}, btn));
    }
  }
  list.replaceChildren(...items);
  $('unassigned').hidden = items.length === 0;
}

function placeNow() {
  for (const el of document.querySelectorAll('.now')) el.remove();
  if (!current) return;
  const now = pragueNow();
  const { scale, range } = current;
  if (now.minutes < range.start || now.minutes > range.end) return;
  const day = document.querySelector(`.day[data-date="${now.date}"]`);
  if (!day) return;
  const y = scale.y(now.minutes);
  for (const track of day.querySelectorAll('.track')) {
    const line = h('span', { class: 'now', 'aria-hidden': 'true', title: `Teď: ${fmtTime(now.minutes)}` });
    line.style.top = u(y);
    track.append(line);
  }
}

/* ---------- detail dialog ---------- */

function fact(label, ...value) {
  return h('div', { class: 'fact' }, h('dt', { text: label }), h('dd', {}, ...value));
}

function openDetail(ev) {
  const data = state.data;
  const ref = ev.ref;
  const dialog = $('detail');
  const today = pragueNow().date;
  const room = data.rooms.find((r) => r.id === ref.room);
  const dayName = DAY_NAMES[diffDays(ev.date, mondayOf(ev.date))];
  const isCourse = ref.kind === 'course';

  const close = h('button', { type: 'button', class: 'detail__close', 'aria-label': 'Zavřít' },
    h('span', { 'aria-hidden': 'true', text: '×' }));
  close.addEventListener('click', () => dialog.close());

  const head = h('header', { class: `detail__head hue-${ref.hue}` },
    h('div', {},
      h('p', { class: 'detail__kicker', text: isCourse ? (ref.level || 'kurz') : 'pravidelná akce' }),
      h('h2', { id: 'detail-title', text: ref.category })),
    close);

  const facts = h('dl', { class: 'facts' },
    fact('Kdy', `${cap(dayName)} ${fmtDate(ev.date)}, ${fmtTimeRange(ref.start, ref.end)}`),
    fact('Sál', room ? room.name : (ref.roomRaw ? `${ref.roomRaw} (nerozpoznaný sál)` : 'neuvedeno')),
    ref.lecturer && fact('Lektor', ref.lecturer),
    isCourse && ref.code && fact('Kód kurzu', ref.code),
    isCourse && fact('Termín', `${fmtDateRange(ref.firstDate, ref.lastDate)} · ${lessonsWord(ref.dates.length)}`),
    !isCourse && fact('Opakování', `každý týden, ${dayName} ${fmtTimeRange(ref.start, ref.end)}`));

  const body = h('div', { class: 'detail__body' }, facts);

  if (isCourse) {
    const skipped = skippedDates(ref.dates);
    body.append(h('section', { class: 'lessons', 'aria-labelledby': 'lessons-title' },
      h('h3', { id: 'lessons-title', text: 'Všechny lekce' }),
      h('ol', { class: 'lessons__list' }, ref.dates.map((d) => h('li', {
        class: `${d === ev.date ? 'is-current' : ''}${d < today ? ' is-past' : ''}`.trim() || null,
        'aria-current': d === ev.date ? 'date' : null,
        text: fmtDayMonth(d),
        title: fmtDate(d),
      }))),
      skipped.length > 0 && h('p', { class: 'hint', text: `Lekce se nekoná: ${fmtDateList(skipped)}.` })));
  } else {
    const upcoming = ref.skipDates.filter((d) => d >= today);
    // Only the nearest upcoming closure; the data may list them years ahead.
    const closures = ref.respectsClosures
      ? data.closures.filter((c) => c.to >= today).sort((x, y) => x.from.localeCompare(y.from)).slice(0, 1)
      : [];
    const parts = [];
    if (upcoming.length) parts.push(`Nekoná se: ${fmtDateList(upcoming)}.`);
    for (const c of closures) parts.push(`${cap(c.label)}: ${fmtDateRange(c.from, c.to)} se nekoná.`);
    if (!ref.respectsHolidays) parts.push('Probíhá i o státních svátcích.');
    if (parts.length) body.append(h('p', { class: 'hint', text: parts.join(' ') }));
  }

  if (ref.url) {
    body.append(h('p', {}, h('a', {
      class: 'extlink', href: ref.url, target: '_blank', rel: 'noopener noreferrer',
      text: isCourse ? 'Stránka kurzu na webu školy' : 'Stránka akce na webu školy',
    })));
  }

  body.append(buildCalendarBlock(ev));
  dialog.replaceChildren(head, body);
  if (typeof dialog.showModal === 'function') {
    if (dialog.open) dialog.close();
    dialog.showModal();
    dialog.scrollTop = 0;
  } else {
    dialog.setAttribute('open', '');
  }
}

function lessonsWord(n) {
  if (n === 1) return '1 lekce';
  return `${n} ${n >= 2 && n <= 4 ? 'lekce' : 'lekcí'}`;
}

function gcalLink(url, text, label) {
  return h('a', { class: 'btn btn--cal', href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': label },
    h('span', { class: 'gdot', 'aria-hidden': 'true' }), h('span', { text }));
}

function icsButton(text, filename, build) {
  const btn = h('button', { type: 'button', class: 'btn btn--cal' },
    h('span', { class: 'icsdot', 'aria-hidden': 'true' }), h('span', { text }));
  btn.addEventListener('click', () => download(filename, build()));
  return btn;
}

function buildCalendarBlock(ev) {
  const data = state.data;
  const ref = ev.ref;
  const block = h('section', { class: 'cal', 'aria-labelledby': 'cal-title' },
    h('h3', { id: 'cal-title', text: 'Přidat do kalendáře' }));

  const single = h('div', { class: 'cal__row' },
    h('p', { class: 'cal__label' },
      h('strong', { text: ref.kind === 'course' ? 'Jen tato lekce' : 'Jen tento termín' }),
      h('span', { text: fmtDate(ev.date) })),
    h('div', { class: 'cal__btns' }, gcalLink(googleSingleUrl(data, ref, ev.date), 'Google Kalendář')));
  block.append(single);

  if (ref.kind === 'course') {
    // One Google link per uninterrupted run of weeks, so no lesson lands on a
    // date when the course does not run (holidays, Christmas closure).
    const parts = googleSeriesParts(data, ref);
    const skipped = skippedDates(ref.dates);
    const partRange = (p) => (p.count > 1 ? `${fmtDayMonth(p.from)} – ${fmtDayMonth(p.to)}` : fmtDayMonth(p.from));
    block.append(h('div', { class: 'cal__row' },
      h('p', { class: 'cal__label' },
        h('strong', { text: 'Celý kurz' }),
        h('span', { text: lessonsWord(ref.dates.length) })),
      h('div', { class: 'cal__btns' },
        parts.length === 1
          ? gcalLink(parts[0].url, 'Google Kalendář')
          : parts.map((p, i) => gcalLink(p.url, `Google ${i + 1}/${parts.length}: ${partRange(p)}`,
            `Google Kalendář, část ${i + 1} z ${parts.length}: ${partRange(p)}, ${lessonsWord(p.count)}`)),
        icsButton('Stáhnout .ics', `eso-${fileSlug(ref.code || ref.category)}.ics`, () => courseIcs(data, ref)))));
    const ics = 'Soubor .ics obsahuje přesně jednotlivé lekce a jde otevřít v kalendáři Apple, Outlook i importovat do Google Kalendáře.';
    block.append(h('p', { class: 'hint', text: parts.length > 1
      ? `Opakovaná událost v Google Kalendáři neumí vynechat ${skipped.length ? `termíny, kdy se netančí (${fmtDateList(skipped)})` : 'týden'}, proto je kurz rozdělený na ${parts.length} části – přidejte je postupně. ${ics}`
      : ics }));
  } else {
    block.append(h('div', { class: 'cal__row' },
      h('p', { class: 'cal__label' },
        h('strong', { text: 'Každý týden' }),
        h('span', { text: `od ${fmtDate(ev.date)}` })),
      h('div', { class: 'cal__btns' },
        gcalLink(googleSeriesUrl(data, ref, ev.date), 'Google Kalendář'),
        icsButton('Stáhnout .ics', `eso-${fileSlug(ref.id)}.ics`, () => recurringIcs(data, ref, ev.date)))));
    block.append(h('p', { class: 'hint',
      text: 'Opakovaná událost v Google Kalendáři neobsahuje výjimky (zrušené termíny, Vánoce). Soubor .ics vynechá ty, které jsou známé dnes; pozdější změny se do kalendáře samy nepromítnou.' }));
  }
  return block;
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

boot();
