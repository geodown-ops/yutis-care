variable "project_id" {
  description = "GCP project for this environment. Production and demo each have their own project."
  type        = string
}

variable "region" {
  description = "Taiwan region."
  type        = string
  default     = "asia-east1"
}

variable "environment" {
  description = "production or demo."
  type        = string
  validation {
    condition     = contains(["production", "demo"], var.environment)
    error_message = "environment must be production or demo."
  }
}

variable "certificate_domain" {
  description = "The certificate covers this name and *.this name (care.yutis.com.tw in production, demo.care.yutis.com.tw on the demo site)."
  type        = string
}

variable "tenant_hosts" {
  description = "Host names served by the tenant back office, employee portal and tenant API (wildcards allowed)."
  type        = list(string)
}

variable "tenant_base_domain" {
  description = "Tenants are {slug}.{this}. The demo site uses the production base domain with its single tenant \"demo\", so demo.care.yutis.com.tw resolves to it."
  type        = string
  default     = "care.yutis.com.tw"
}

variable "platform_host" {
  description = "Host name of the platform back office behind Identity-Aware Proxy; null to leave the platform out of this environment."
  type        = string
  default     = null
}

variable "platform_staff" {
  description = "Who may pass Identity-Aware Proxy to the platform back office, e.g. [\"group:ops@yutis.com.tw\"] or [\"user:a@yutis.com.tw\"]."
  type        = list(string)
  default     = []
}

variable "platform_admin_emails" {
  description = "Accounts that get the 營運 platform role on the first deployment (they must also be in platform_staff)."
  type        = list(string)
  default     = []
}

variable "demo_site" {
  description = "The marketing demo site: fictional data only, dev sign-in on, nightly reset. Never true for production."
  type        = bool
  default     = false
}

variable "web_api_mode" {
  description = "live: the front ends call the API. demo: self-contained front ends with built-in fictional data. Used by the deploy workflow when building the web image."
  type        = string
  default     = "live"
}

variable "database_tier" {
  description = "Cloud SQL machine tier."
  type        = string
}

variable "database_high_availability" {
  description = "Regional (two-zone) Cloud SQL with automatic failover."
  type        = bool
  default     = false
}

variable "database_disk_gb" {
  type    = number
  default = 20
}

variable "backup_retention_days" {
  description = "Daily backups kept, with point-in-time recovery over the transaction-log window."
  type        = number
  default     = 30
}

variable "deletion_protection" {
  description = "Protects the database instance from terraform destroy and console deletion."
  type        = bool
  default     = true
}

variable "api_min_instances" {
  description = "Warm tenant API instances (0 lets it scale to zero, with a cold start on the first request)."
  type        = number
  default     = 0
}

variable "github_repository" {
  description = "owner/repo allowed to deploy through Workload Identity Federation."
  type        = string
  default     = "geodown-ops/yutis-care"
}

variable "github_environment" {
  description = "GitHub Actions environment whose jobs may deploy here (protect it with required reviewers in production)."
  type        = string
}

variable "identity_platform" {
  description = "Enable Identity Platform with multi-tenancy (one sign-in tenant per Yutis tenant, for SSO, MFA, SMS)."
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Where uptime and error alerts go; null for no alerts."
  type        = string
  default     = null
}

variable "email_from" {
  description = "Sender of invitations and sign-off links through Resend, e.g. \"Yutis Care <noreply@care.yutis.com.tw>\"; empty = emails are only logged. Verify the domain in Resend and add the API key to the resend-api-key secret first."
  type        = string
  default     = ""
}
