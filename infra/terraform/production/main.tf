# 正式站 care.yutis.com.tw：租戶 {slug}.care.yutis.com.tw（/me 員工端），平台管理後台 admin.care.yutis.com.tw。
terraform {
  backend "gcs" {
    prefix = "production"
    # bucket: terraform init -backend-config="bucket=<state bucket>"
  }
}

provider "google" {
  project = var.project_id
  region  = "asia-east1"
}

variable "project_id" {
  type = string
}

variable "platform_staff" {
  type = list(string)
}

variable "platform_admin_emails" {
  type = list(string)
}

variable "alert_email" {
  type    = string
  default = null
}

module "env" {
  source      = "../modules/environment"
  project_id  = var.project_id
  environment = "production"

  certificate_domain = "care.yutis.com.tw"
  tenant_hosts       = ["*.care.yutis.com.tw"]
  platform_host      = "admin.care.yutis.com.tw"
  web_api_mode       = "live"

  platform_staff        = var.platform_staff
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
