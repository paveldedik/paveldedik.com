# The Cloudflare API token is read from the CLOUDFLARE_API_TOKEN environment
# variable (sourced from ../../.env) — never committed, never in tfvars.
# The same token is reused by `wrangler` for the artifact push.
provider "cloudflare" {}
