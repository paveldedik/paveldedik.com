terraform {
  required_version = ">= 1.6.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # Remote state in Cloudflare R2 (S3-compatible). The account-specific S3
  # endpoint is supplied at init time via the gitignored ../../backend.hcl shared
  # with every module in this zone:
  #
  #   terraform init -backend-config=../../backend.hcl
  #
  # The bucket (paveldedik-tfstate) must already exist — see ../../README.md
  # "Bootstrap". Each module gets its own `key`, so every module holds
  # independent state and a mistake in one can never corrupt the other.
  # R2 S3 credentials are read from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
  backend "s3" {
    bucket = "paveldedik-tfstate"
    key    = "root/terraform.tfstate"
    region = "auto"

    # R2 is S3-compatible but not real S3 — disable the AWS-only preflight
    # checks the s3 backend would otherwise run (and the newer AWS SDK's
    # request checksums, which R2 rejects).
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}
