import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const LIVE = path.join(FIXTURES, 'live'); // pages saved on 2026-11-10 (trimmed to <main>)
export const TODAY = '2026-11-10';

export function fixture(...parts) {
  return readFileSync(path.join(FIXTURES, ...parts), 'utf8');
}

/** A minimal listing page with one course table. */
export function listingPage(rows, header = '<th>Kurz</th><th>Den</th><th>Čas</th><th>Místo</th><th>Začátek</th><th>Lektor</th><th></th>') {
  return `<main><div class="course-category"><h2 class="course-category-title">
    <a href="https://www.tanecniskolaeso.cz/tanecni-kurzy/dubove-tanecni"><span class="kurz-uroven">mírně pokročilí</span><br>Dubové taneční</a></h2>
    <table class="table dkurzu"><thead><tr>${header}</tr></thead><tbody>${rows.join('\n')}</tbody></table></div></main>`;
}

export function row(...cells) {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}
