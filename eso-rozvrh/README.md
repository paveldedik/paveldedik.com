# eso-rozvrh.paveldedik.com

A weekly timetable of the two halls (Velký sál, Malý sál) of
[Taneční škola Eso](https://www.tanecniskolaeso.cz/) in Brno, so that it is
obvious at a glance **when a hall is free**. The school publishes only course
listings, no timetable; this site rebuilds one from them. The UI is in Czech.

Not affiliated with the school. Everything shown comes from its public pages.

```
eso-rozvrh/
├── site/                    # the deployed directory, no build step
│   ├── index.html  style.css
│   ├── app.js               # the page: fetches the data, draws the week (DOM)
│   ├── lib.js               # the logic app.js imports, DOM-free so it can be tested
│   └── data/schedule.json   # written by the scraper, fetched by app.js
├── site-test/               # node:test tests of site/lib.js; not deployed
└── scraper/                 # Node 20+ ESM, no dependencies
    ├── scrape.mjs           # the CLI, `node scrape.mjs`
    ├── lib/                 # parsing, date arithmetic, merging
    └── test/                # node:test tests + saved pages in test/fixtures/
```

Infra is `terraform/eso-rozvrh` (Pages project `eso-rozvrh`, the proxied CNAME,
the domain binding); the pipeline is `.github/workflows/eso-rozvrh.yml`. The
repo-wide rules are in [`../README.md`](../README.md).

## How the data flows

```
tanecniskolaeso.cz ──scraper──▶ site/data/schedule.json ──commit──▶ master ──wrangler──▶ Cloudflare Pages
   (weekly, Mon 04:17 UTC)        (merged, never replaced)     (only if changed)            app.js fetches it
```

1. **Scrape.** The scraper reads the course listing
   (`/tanecni-kurzy`: code, day, time, hall, first–last date, lecturer), the
   category pages (holiday and Christmas-closure notes) and the Friday
   *tančírna* page. It computes every lesson date itself: weekly from the first
   to the last date, minus Czech public holidays and the closures.
2. **Merge.** The listing shows only courses open for enrolment — a course
   disappears from it while it is still running. So the scraper **merges into
   the existing file and never drops a course**; `lastSeen` records when the
   course was last listed.
3. **Commit.** As `github-actions[bot]`, when the content meaningfully
   changed — and otherwise every other week, to refresh the check date (see
   [The pipeline](#the-pipeline)). An unchanged week in between just refreshes
   `checkedAt`, which is deployed but not committed.
4. **Deploy.** `site/` is uploaded to the Pages project as is. `app.js` fetches
   `data/schedule.json` and draws the selected week: courses from their explicit
   `dates`, recurring events expanded in the browser.

## Running it locally

No install step — neither the site nor the scraper has dependencies. The
scraper's `package.json` only names the scripts: `npm test` there is the same
as `node --test`, and there is no lockfile, so don't run `npm ci`.

```sh
# the site (any static server; fetch() does not work from file://)
python3 -m http.server 8000 --directory eso-rozvrh/site   # http://localhost:8000

# the scraper's tests — saved HTML fixtures, never the live site
cd eso-rozvrh/scraper && node --test

# the site's tests (site/lib.js). Run them from inside the directory:
# `node --test eso-rozvrh/site-test/` fails on Node 22
cd eso-rozvrh/site-test && node --test

# a real scrape: a handful of requests to the school's site, rewrites
# ../site/data/schedule.json in place (review with `git diff`)
cd eso-rozvrh/scraper && node scrape.mjs
```

Committing a locally scraped `schedule.json` is fine; the next weekly run
merges on top of it.

## The pipeline

`.github/workflows/eso-rozvrh.yml` — one workflow, deliberately not a job in
`deploy.yml`, because it also runs on a schedule, scrapes and commits.

| Trigger | Scrape OK, data changed | Scrape OK, unchanged | Scrape failed |
|---|---|---|---|
| Monday 04:17 UTC | commit + deploy | deploy (fresh `checkedAt`); commit if due | no deploy, **run fails** |
| push touching `eso-rozvrh/**` | commit + deploy | deploy; commit if due | deploy the last committed data, **run fails** |
| Run workflow (by hand, on `master`) | commit + deploy | deploy; commit if due | deploy the last committed data, **run fails** |

- Tests run first (the scraper's, then the site's); a failing test stops the
  run before anything is scraped or deployed.
- **"Commit if due"**: an unchanged file is still committed once the committed
  copy was last checked 13 or more days ago (`REFRESH_AFTER_DAYS`) — so about
  every other week, as `eso-rozvrh: refresh the check date of the schedule
  data`. The committed file is what the next run starts from and what a failed
  scrape or a deploy by hand publishes, so it must not go stale: the page
  shows a "data could not be updated" banner when `checkedAt` is over 21 days
  old.
- The scrape step may take up to 25 minutes, the whole job 40. That is far
  above the scraper's own retry budget (about 3 minutes at worst for the
  listing, plus one shared 90 s deadline for the category and tančírna pages,
  so about 4.5 minutes in total); a normal run takes well under a minute. If
  the scraper's retries grow, keep both limits above them.
- The data commit is pushed with `GITHUB_TOKEN`. GitHub starts no workflow for
  such a push, so it cannot re-trigger this workflow or `deploy.yml`. If
  `master` moved meanwhile, the step rebases and retries.
- GitHub disables scheduled workflows in public repos after 60 days without
  repository activity. Every scheduled run re-enables the workflow through the
  API (`actions: write`), which resets that timer; the fortnightly data commit
  is repository activity as well.
- Secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, the same ones
  `deploy.yml` uses.

Deploy by hand (uploads the whole directory, which is what the pipeline does
minus its exclusion of test files). It publishes your local `schedule.json`,
so pull first — the bot's copy on `master` is at most two weeks behind the
last check, an old checkout can be much further:

```sh
git pull
source .env
npx wrangler@4 pages deploy eso-rozvrh/site --project-name=eso-rozvrh --branch=master
```

## When the weekly run fails

GitHub mails the failed run. The site is never broken by it — it keeps serving
the last good data, and the page shows when the data was last checked.

| Failing step | Likely cause | What to do |
|---|---|---|
| *Scrape tanecniskolaeso.cz* — network error, timeout, HTTP 5xx | The school's site was down. | Nothing; re-run the workflow later or wait for next Monday. |
| *Scrape tanecniskolaeso.cz* — parse/validation error | The school changed its markup or wording. | Save the new page as a fixture in `scraper/`, fix the parser until `node --test` passes and `node scrape.mjs` produces a sane `git diff`, push. |
| *Scrape tanecniskolaeso.cz* — cancelled after 25 minutes | The school's site answered so slowly that the retries outran the step's limit. | As for a network error. |
| *Test the scraper* / *Test the site* | A code change broke a test. | Run them locally (see [Running it locally](#running-it-locally)), fix and push. |
| *Commit the new data* | A rebase conflict in `schedule.json` (it was edited by hand at the same time). | Re-run the workflow. |
| *Deploy to Cloudflare Pages* | Token expired or lost the Pages scope; Pages project missing. | Rotate the secret (see `../README.md`), re-run. |

If nothing has run for more than a week: Actions → *Eso rozvrh* → check that the
workflow is not disabled, and *Enable workflow* if it is.

A sudden large diff in a data commit (many courses gone or moved) is worth a
look — the scraper is built to fail rather than guess, but the school's pages
are free text.

## First provision

**Do this before the first push of `terraform/eso-rozvrh` and the workflow.**
A push to `master` makes `terraform.yml` apply the whole module at once, which
would bind `eso-rozvrh.paveldedik.com` to an **empty** Pages project; and the
site workflow cannot deploy to a project that does not exist yet. So, locally,
from the repo root:

```sh
source .env

# 1. the Pages project only
cd terraform/eso-rozvrh
terraform init -backend-config=../../backend.hcl
terraform apply -target=cloudflare_pages_project.eso_rozvrh
cd ../..

# 2. put the site into it and check it on the pages.dev host
#    (wrangler prints the URL; Cloudflare may suffix the name)
npx wrangler@4 pages deploy eso-rozvrh/site --project-name=eso-rozvrh --branch=master
curl -I https://eso-rozvrh.pages.dev/

# 3. the DNS record and the domain binding
cd terraform/eso-rozvrh
terraform plan      # expect 2 to add: the CNAME and the pages domain — nothing else
terraform apply
```

The custom domain activates a minute or two after the last `apply`. Then push:
`terraform.yml` plans `No changes` and `eso-rozvrh.yml` deploys the same files
again.

The module declares only the `eso-rozvrh` record — abort any plan that mentions
the apex, `www`, mail or another hostname.

## The data contract

`site/data/schedule.json` is the only interface between the scraper and the
page. Dates are `YYYY-MM-DD`, times `HH:MM` in Europe/Prague, `weekday` is ISO
(1 = Monday … 7 = Sunday).

| Field | Meaning |
|---|---|
| `schemaVersion` | `1`. The pipeline refuses to publish anything else. |
| `checkedAt` / `updatedAt` | Last successful scrape / last meaningful change (UTC). |
| `source`, `venue` | The listing URL; the school's name and address. |
| `rooms[]` | `{ id, name }` — `velky`, `maly`. |
| `courses[]` | `code`, `category`, `level`, `url`, `weekday`, `start`, `end`, `room` (`velky` \| `maly` \| `null` when the place text was not recognized; `roomRaw` keeps the original), `firstDate`, `lastDate`, `lecturer`, **`dates[]`** (every lesson, holidays and closures already removed), `firstSeen`, `lastSeen`. |
| `recurring[]` | Weekly events without an end, e.g. the Friday tančírna: `id`, `title`, `url`, `weekday`, `start`, `end`, `room`, `skipDates[]`, `respectsClosures`, `respectsHolidays`. Expanded by the page for the displayed week. |
| `closures[]` | `{ from, to, label }`, inclusive — nothing happens in the halls (Christmas). |
| `notes[]` | `{ source, text }` — the school's own sentences about exceptions, shown verbatim. |

The page tolerates unknown extra fields. Changing or removing an existing field
means changing the scraper and `app.js` together and bumping `schemaVersion`
(and the checks in the workflow).
