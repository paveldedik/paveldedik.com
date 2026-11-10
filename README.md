# paveldedik.com

Everything behind the `paveldedik.com` Cloudflare zone in one repo: the sites
and the Terraform that serves them. Same pattern as `~/Projects/pavlanna.cz`.

```
paveldedik.com/
├── .env  backend.hcl        # gitignored, shared by every module (*.example committed)
├── .github/workflows/       # deploy.yml (site) and terraform.yml (infra)
├── root/                    # the apex site — an Astro project, built to static HTML
└── terraform/
    └── root/                # paveldedik.com + www → state key root/terraform.tfstate
```

| Hostname | Code | Terraform | Served by |
|---|---|---|---|
| `paveldedik.com` (+ `www` 301) | `root/` | `terraform/root` | Cloudflare Pages, project `paveldedik` |

**One Terraform module per hostname**, each with its own state file in the
`paveldedik-tfstate` R2 bucket. A new subdomain gets a code directory next to
`root/`, a module next to `terraform/root/` with its own state `key`, and a job
in `.github/workflows/deploy.yml` — see [Adding a subdomain](#adding-a-subdomain).

> **Never change a module's backend `key`** without migrating state.

## Developing the site

Everything Node runs **from `root/`**:

```sh
cd root
npm install
npm run dev       # http://localhost:4321
npm run build     # static output in root/dist/
npm run preview
```

Astro 5, TypeScript strict, plain CSS in `src/styles/global.css`, no client-side
JavaScript. Pages live in `root/src/pages/` (`index`, `work`, `opensource`,
`contact`); see `AGENTS.md` for the code style.

## Pipelines

Two GitHub Actions workflows, both on `master`, each triggered by its own part
of the repo:

| Workflow | Runs when | Does |
|---|---|---|
| `.github/workflows/deploy.yml` | every push to `master` | Builds `root/` and uploads `root/dist` to the Pages project with `wrangler pages deploy` (direct upload). |
| `.github/workflows/terraform.yml` | a push or pull request that touches `terraform/**` (or the workflow file) | `fmt -check`, `init`, `validate`, `plan` for **every** module under `terraform/`; on `master` it then applies the saved plan. A pull request only plans. |

A content change never runs Terraform, and a Terraform change still redeploys
the site (harmless — the same build is uploaded again).

The Terraform workflow discovers modules by listing `terraform/*/`, so a new
module needs no workflow edit. It runs them one at a time and never overlaps
with another run, because the R2 backend has no state locking. An untouched
module plans to `No changes`, so applying all of them is safe.

> **A push to `master` that changes `terraform/` is applied without a
> confirmation step.** Read the plan locally (or open a pull request and read
> the plan there) before merging anything that destroys or replaces a resource.

Both workflows can also be started by hand (Actions → the workflow → Run
workflow).

### Repository secrets

Settings → Secrets and variables → Actions:

| Secret | Used by | Value |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | both | The same token as in `.env` (Pages: Edit on the account, DNS: Edit and Single Redirect: Edit on the zone). |
| `CLOUDFLARE_ACCOUNT_ID` | both | The account ID; also builds the R2 endpoint for `terraform init`. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | terraform | The R2 keypair for the state bucket (`AWS_*` in `.env`). |

The zone ID is not a secret and is written directly in `terraform.yml`. To
rotate a secret, update `.env` and run
`source .env && gh secret set NAME --body "$VALUE"`.

### Deploying by hand

```sh
cd root && source ../.env && npm run deploy
```

Both paths pass `--branch=master`, which must match the project's
`production_branch`; any other branch name produces a preview deployment.

## Running Terraform locally

Needed for reading a plan before pushing, and for the first provision of a new
hostname (below). Two gitignored files at the repo root are shared by every
module:

```sh
cp .env.example .env                 # token, account ID, zone ID, R2 keypair
cp backend.hcl.example backend.hcl   # your R2 S3 endpoint
```

The account ID, the R2 keypair and `backend.hcl` are the same as in
`~/Projects/pavlanna.cz` (same Cloudflare account); the API token is shared too
and covers both zones. `.env.example` lists the scopes.

```sh
source .env
cd terraform/root
terraform init -backend-config=../../backend.hcl
terraform plan
```

**Steady-state plans must be `No changes`.** The module declares only the apex
and `www` records; abort any plan that mentions mail or another hostname.

After changing a provider version, refresh the lock file for CI's platform too:

```sh
terraform providers lock -platform=linux_amd64 -platform=darwin_arm64 -platform=darwin_amd64
```

## Adding a subdomain

For `blog.paveldedik.com`:

1. **Code** — a `blog/` directory next to `root/`.
2. **Module** — copy `terraform/root` to `terraform/blog`; give `versions.tf` a
   **new, unique** backend `key` (`blog/terraform.tfstate`) and change the
   project name and hostname in `variables.tf` / `main.tf`. Drop the `www`
   record and the redirect ruleset — those belong to the apex only.
3. **First provision, locally** — see below. Do this *before* pushing, so the
   pipeline never binds a domain to an empty project.
4. **Deploy job** — copy the `root` job in `deploy.yml`, changing the working
   directory, the cache path and `--project-name`.
5. **Docs** — add a row to the table at the top and to `AGENTS.md`.

## What is NOT managed here

`terraform/root` declares only the apex and `www` records. These were set up by
hand and no module may declare them:

- **The zone itself** — added in the Cloudflare dashboard (Free plan); the
  registrar is Active24, with nameservers pointed at Cloudflare. DNSSEC is off.
- **Mail and verification** — `MX` → `aspmx.l.google.com` and the
  `google-site-verification` `TXT` at the apex.
- **The state bucket** `paveldedik-tfstate` and the API token / R2 keypair.

### First provision of a Pages-backed hostname

Binding a custom domain to an **empty** Pages project serves an empty site, and
the project does not exist before the first apply — so a new hostname runs in
three steps, run locally (shown for `root`):

```sh
cd terraform/root && terraform apply -target=cloudflare_pages_project.root
cd ../../root && npm run deploy && curl -I https://paveldedik.pages.dev/
cd ../terraform/root && terraform apply
```

Custom-domain activation takes a minute or two after `apply`. Once the state
holds everything, push: the pipeline plans `No changes`.

## What's committed vs. local

- **Committed:** the site, `*.tf`, `**/.terraform.lock.hcl`, the `*.example`
  templates, the docs.
- **Gitignored:** `.env`, `backend.hcl`, `**/.terraform/`, any `*.tfstate*`,
  `root/dist`, `root/node_modules`.

## License

Copyright © 2026 Pavel Dedík
