output "pages_dev_url" {
  description = "The project's default Cloudflare Pages URL (Cloudflare may suffix the name for global uniqueness). Smoke-test the deploy here before the custom-domain binding activates."
  value       = "https://${cloudflare_pages_project.eso_rozvrh.subdomain}"
}

output "custom_domain_url" {
  description = "The public URL once the custom domain is active."
  value       = "https://${var.domain}"
}

output "project_name" {
  description = "Pass to wrangler as --project-name when pushing the site."
  value       = cloudflare_pages_project.eso_rozvrh.name
}
