# 示範站 demo.care.yutis.net：獨立 GCP 專案與資料庫，只放虛構資料，每晚 04:00 重置。
terraform {
  backend "gcs" {
    prefix = "demo"
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

variable "alert_email" {
  type    = string
  default = null
}

module "env" {
  source      = "../modules/environment"
  project_id  = var.project_id
  environment = "demo"
  demo_site   = true

  # The demo tenant's slug is "demo" on the production base domain, so demo.care.yutis.net resolves to it.
  certificate_domain = "demo.care.yutis.net"
  tenant_hosts       = ["demo.care.yutis.net"]
  tenant_base_domain = "care.yutis.net"
  platform_host      = null
  # The front ends' own fictional data and role switcher, until the screens are connected to the API.
  web_api_mode = "demo"

  database_tier              = "db-g1-small"
  database_high_availability = false
  backup_retention_days      = 7
  deletion_protection        = false
  api_min_instances          = 0

  github_environment = "demo"
  identity_platform  = false
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
