variable "account_id" {
  description = "Cloudflare account ID that owns the Pages project and the paveldedik.com zone. Exported as TF_VAR_account_id from ../../.env."
  type        = string
}

variable "zone_id" {
  description = "paveldedik.com zone ID — owns the apex/www records and the www->apex redirect. Exported as TF_VAR_zone_id from ../../.env."
  type        = string
}

variable "project_name" {
  description = "Pages project name — also the *.pages.dev subdomain and the wrangler --project-name. Internal only; renaming it would force a destroy/recreate of the live project."
  type        = string
  default     = "paveldedik"
}

variable "domain" {
  description = "Apex custom domain bound to the Pages project (www 301-redirects to it)."
  type        = string
  default     = "paveldedik.com"
}

variable "production_branch" {
  description = "Production branch of the Pages project. The pipeline deploys with --branch=master; an upload under any other branch name becomes a preview deployment."
  type        = string
  default     = "master"
}
