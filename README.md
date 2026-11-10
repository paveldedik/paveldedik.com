# paveldedik.com

Everything behind the `paveldedik.com` Cloudflare zone in one repo: the sites
and the Terraform that serves them. Same pattern as `~/Projects/pavlanna.cz`.

```
paveldedik.com/
├── .env  backend.hcl        # gitignored, shared by every module (*.example committed)
├── .github/workflows/       # at the toplevel: Actions only looks here
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
in `.github/workflows/deploy.yml` — e.g. `blog/` plus `terraform/blog/`.

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

## Deployment

A push to `master` runs `.github/workflows/deploy.yml`: it builds `root/` and
pushes `root/dist` to the Pages project with `wrangler pages deploy` (direct
upload). **Terraform is not involved in a content change.**

The workflow needs two repository secrets (Settings → Secrets and variables →
Actions):

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | A token with **Account → Cloudflare Pages: Edit** only. Use a separate, narrower token than the Terraform one — CI never touches DNS. |
| `CLOUDFLARE_ACCOUNT_ID` | The account ID. |

To deploy by hand instead:

```sh
cd root && source ../.env && npm run deploy
```

Both paths pass `--branch=master`, which must match the project's
`production_branch`; any other branch name produces a preview deployment.

## Secrets for Terraform

Two gitignored files at the repo root, shared by every module:

```sh
cp .env.example .env                 # token, account ID, zone ID, R2 keypair
cp backend.hcl.example backend.hcl   # your R2 S3 endpoint
```

The account ID, the R2 keypair and `backend.hcl` are the same as in
`~/Projects/pavlanna.cz` (same Cloudflare account). The API token there is
scoped to the `pavlanna.cz` zone: add `paveldedik.com` to it or create a new
one. `.env.example` lists the scopes.

## Running Terraform

```sh
source .env
cd terraform/root
terraform init -backend-config=../../backend.hcl
terraform plan
```

**Steady-state plans must be `No changes`.** The module declares only the apex
and `www` records; abort any plan that mentions mail or another hostname.

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
three steps (shown for `root`):

```sh
cd terraform/root && terraform apply -target=cloudflare_pages_project.root
cd ../../root && npm run deploy && curl -I https://paveldedik.pages.dev/
cd ../terraform/root && terraform apply
```

Custom-domain activation takes a minute or two after `apply`.

## What's committed vs. local

- **Committed:** the site, `*.tf`, `**/.terraform.lock.hcl`, the `*.example`
  templates, the docs.
- **Gitignored:** `.env`, `backend.hcl`, `**/.terraform/`, any `*.tfstate*`,
  `root/dist`, `root/node_modules`.

## License

Copyright © 2026 Pavel Dedík
