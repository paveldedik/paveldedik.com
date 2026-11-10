# ---------------------------------------------------------------------------
# paveldedik.com apex — the personal site (the Astro project in ../../root).
#
# Direct upload (no `source` block): the GitHub Actions pipeline builds the site
# and pushes it with `wrangler pages deploy`, so Terraform owns only the durable
# project and its custom-domain binding — never the build or the deployments.
#
# SCOPE: this module declares ONLY the apex and www records. Mail (MX, SPF),
# the google-site-verification TXT and any future subdomain belong elsewhere.
# Abort any plan that mentions them.
# ---------------------------------------------------------------------------

resource "cloudflare_pages_project" "root" {
  account_id        = var.account_id
  name              = var.project_name
  production_branch = var.production_branch
}

# Apex CNAME -> the project's real *.pages.dev target. `content` reads the
# project's computed subdomain, which Cloudflare may suffix for global
# uniqueness (e.g. paveldedik-7q3.pages.dev), so the host is never hardcoded.
# Cloudflare CNAME-flattens a proxied apex CNAME into A/AAAA at the edge.
#
# A CNAME cannot coexist with the four GitHub Pages A records the zone import
# brings over from Websupport — delete those first (see README "Cutover").
resource "cloudflare_dns_record" "apex" {
  zone_id = var.zone_id
  name    = var.domain
  type    = "CNAME"
  content = cloudflare_pages_project.root.subdomain
  ttl     = 1
  proxied = true
}

# Proxied www record so www.paveldedik.com hits Cloudflare's edge, where the
# redirect ruleset below 301s it to the apex. It must be proxied for the
# redirect to fire; the content is only a flattening target.
resource "cloudflare_dns_record" "www" {
  zone_id = var.zone_id
  name    = "www.${var.domain}"
  type    = "CNAME"
  content = var.domain
  ttl     = 1
  proxied = true
}

# 301 www.paveldedik.com/* -> https://paveldedik.com/* (path + query preserved).
resource "cloudflare_ruleset" "www_redirect" {
  zone_id = var.zone_id
  name    = "Redirect www to apex"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules = [{
    ref         = "www_to_apex"
    description = "301 www.${var.domain} -> ${var.domain}"
    expression  = "(http.host eq \"www.${var.domain}\")"
    action      = "redirect"
    enabled     = true
    action_parameters = {
      from_value = {
        status_code           = 301
        preserve_query_string = true
        target_url = {
          expression = "concat(\"https://${var.domain}\", http.request.uri.path)"
        }
      }
    }
  }]

  depends_on = [cloudflare_dns_record.www]
}

# Bind the apex custom domain to the Pages project (after its CNAME exists).
# www stays redirect-only — it needs no binding of its own.
#
# Populate the project (run the pipeline, or `npm run deploy` in ../../root)
# BEFORE this is applied, so the apex is never bound to an empty project.
resource "cloudflare_pages_domain" "apex" {
  account_id   = var.account_id
  project_name = cloudflare_pages_project.root.name
  name         = var.domain

  depends_on = [cloudflare_dns_record.apex]
}
