# 正式站 care.yutis.net：官網與線上申請試用在 care.yutis.net，租戶 {slug}.care.yutis.net（/me 員工端），平台管理後台 admin.care.yutis.net。
terraform {
  backend "gcs" {
    prefix = "production"
    # bucket: terraform init -backend-config="bucket=<state bucket>"
  }
}

provider "google" {
  project = var.project_id
  region  = "asia-east1"
  # With a person's credentials (Cloud Shell), APIs such as API Keys and Identity Toolkit need a quota project.
  user_project_override = true
  billing_project       = var.project_id
}

variable "project_id" {
  type = string
}

variable "platform_staff" {
  description = "Who may pass Identity-Aware Proxy (ignored with platform_sign_in)."
  type        = list(string)
  default     = []
}

variable "platform_sign_in" {
  description = "Platform staff sign in with Google instead of IAP: set true when the project has no Google Workspace organization."
  type        = bool
  default     = false
}

variable "platform_admin_emails" {
  type = list(string)
}

variable "alert_email" {
  type    = string
  default = null
}

variable "domain" {
  description = "Tenants at {slug}.<domain>, the platform back office at admin.<domain>."
  type        = string
  default     = "care.yutis.net"
}

variable "email_from" {
  type    = string
  default = ""
}

variable "trial_notify_emails" {
  description = "Who hears about new trial applications from care.yutis.net; null = platform_admin_emails."
  type        = list(string)
  default     = null
}

module "env" {
  source      = "../modules/environment"
  project_id  = var.project_id
  environment = "production"

  certificate_domain = var.domain
  tenant_hosts       = ["*.${var.domain}"]
  platform_host      = "admin.${var.domain}"
  site_host          = var.domain
  tenant_base_domain = var.domain

  platform_staff        = var.platform_staff
  platform_sign_in      = var.platform_sign_in
  platform_admin_emails = var.platform_admin_emails

  database_tier              = "db-custom-2-7680"
  database_high_availability = true
  database_disk_gb           = 50
  backup_retention_days      = 30
  deletion_protection        = true
  api_min_instances          = 1

  github_environment = "production"
  identity_platform  = true
  alert_email        = var.alert_email
  email_from         = var.email_from

  trial_notify_emails = var.trial_notify_emails != null ? var.trial_notify_emails : var.platform_admin_emails
}

output "load_balancer_ip" {
  value = module.env.load_balancer_ip
}

output "dns_records" {
  value = module.env.dns_records
}

output "github_variables" {
  value = module.env.github_variables
}
