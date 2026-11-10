import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDays, christmasClosure, czechHolidays, easterSunday, isCzechHoliday, isoWeekday, lessonDates, todayInPrague, ymd,
} from '../lib/dates.mjs';

test('easter sunday', () => {
  const expected = {
    2016: '2016-03-27', 2019: '2019-04-21', 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05',
    2027: '2027-03-28', 2028: '2028-04-16', 2030: '2030-04-21', 2038: '2038-04-25',
  };
  for (const [year, date] of Object.entries(expected)) assert.equal(easterSunday(+year), date, year);
});

test('czech public holidays', () => {
  assert.deepEqual([...czechHolidays(2027).keys()].sort(), [
    '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-01', '2027-05-08', '2027-07-05', '2027-07-06',
    '2027-09-28', '2027-10-28', '2027-11-17', '2027-12-24', '2027-12-25', '2027-12-26',
  ]);
  assert.equal(czechHolidays(2026).get('2026-04-03'), 'Velký pátek');
  assert.equal(czechHolidays(2026).get('2026-04-06'), 'Velikonoční pondělí');
  assert.ok(isCzechHoliday('2026-11-17'));
  assert.ok(isCzechHoliday('2026-10-28'));
  assert.ok(!isCzechHoliday('2026-11-18'));
  assert.ok(!czechHolidays(2015).has('2015-04-03'), 'Good Friday is a holiday only since 2016');
});

test('date helpers', () => {
  assert.equal(ymd(2026, 2, 29), null);
  assert.equal(ymd(2028, 2, 29), '2028-02-29');
  assert.equal(ymd(2026, 13, 1), null);
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
  assert.equal(isoWeekday('2026-11-30'), 1);
  assert.equal(isoWeekday('2026-11-29'), 7);
  // DST change night: still one calendar day per step
  assert.equal(addDays('2027-03-27', 1), '2027-03-28');
  assert.equal(addDays('2027-03-28', 1), '2027-03-29');
});

test('today is taken in Prague time, not UTC', () => {
  assert.equal(todayInPrague(new Date('2026-11-09T23:30:00Z')), '2026-11-10');
  assert.equal(todayInPrague(new Date('2026-07-01T21:59:00Z')), '2026-07-01');
  assert.equal(todayInPrague(new Date('2026-07-01T22:00:00Z')), '2026-07-02');
});

test('lesson dates skip holidays, closures and cancelled dates', () => {
  const closures = [christmasClosure(2026)];
  assert.deepEqual(lessonDates('2026-11-30', '2027-01-25', { closures }), [
    '2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21', '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25',
  ]);
  // Tuesdays 29.9. - 24.11.2026: 17. 11. is a public holiday
  const tuesdays = lessonDates('2026-09-29', '2026-11-24');
  assert.equal(tuesdays.length, 8);
  assert.ok(!tuesdays.includes('2026-11-17'));
  // Easter Monday 2027
  assert.ok(!lessonDates('2027-03-01', '2027-04-26').includes('2027-03-29'));
  assert.deepEqual(lessonDates('2026-11-30', '2026-12-14', { cancelled: ['2026-12-07'] }), ['2026-11-30', '2026-12-14']);
  // last date not on the weekday of the first one: never overshoots
  assert.deepEqual(lessonDates('2026-11-30', '2026-12-09'), ['2026-11-30', '2026-12-07']);
});
