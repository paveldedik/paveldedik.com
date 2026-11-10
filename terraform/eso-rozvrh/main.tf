# ---------------------------------------------------------------------------
# eso-rozvrh.paveldedik.com — the hall timetable of Taneční škola Eso (the
# plain static site in ../../eso-rozvrh/site, fed by a weekly scraper).
#
# Direct upload (no `source` block): .github/workflows/eso-rozvrh.yml scrapes
# the data and pushes the site with `wrangler pages deploy`, so Terraform owns
# only the durable project and its custom-domain binding — never the
# deployments.
#
# SCOPE: this module declares ONLY the eso-rozvrh record. The apex, www, mail
# and every other hostname belong elsewhere. Abort any plan that mentions them.
# ---------------------------------------------------------------------------

resource "cloudflare_pages_project" "eso_rozvrh" {
  account_id        = var.account_id
  name              = var.project_name
  production_branch = var.production_branch
}

# Subdomain CNAME -> the project's real *.pages.dev target. `content` reads the
# project's computed subdomain, which Cloudflare may suffix for global
# uniqueness (e.g. eso-rozvrh-7q3.pages.dev), so the host is never hardcoded.
resource "cloudflare_dns_record" "eso_rozvrh" {
  zone_id = var.zone_id
  name    = var.domain
  type    = "CNAME"
  content = cloudflare_pages_project.eso_rozvrh.subdomain
  ttl     = 1
  proxied = true
}

# Bind the custom domain to the Pages project (after its CNAME exists).
#
# Populate the project (`wrangler pages deploy`, see ../../eso-rozvrh/README.md
# "First provision") BEFORE this is applied, so the hostname is never bound to
# an empty project. That is why the first apply is local and targeted — a push
# would let terraform.yml apply all three resources at once.
resource "cloudflare_pages_domain" "eso_rozvrh" {
  account_id   = var.account_id
  project_name = cloudflare_pages_project.eso_rozvrh.name
  name         = var.domain

  depends_on = [cloudflare_dns_record.eso_rozvrh]
}
