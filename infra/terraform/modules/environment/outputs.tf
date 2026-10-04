output "load_balancer_ip" {
  description = "Point the site's DNS A records here."
  value       = google_compute_global_address.lb.address
}

output "dns_records" {
  description = "DNS records to create at the DNS host of the domain."
  value = concat(
    [
      {
        name  = google_certificate_manager_dns_authorization.this.dns_resource_record[0].name
        type  = google_certificate_manager_dns_authorization.this.dns_resource_record[0].type
        value = google_certificate_manager_dns_authorization.this.dns_resource_record[0].data
        why   = "certificate validation (keep it: renewals use it)"
      },
    ],
    [for h in distinct(concat(var.tenant_hosts, local.platform ? [var.platform_host] : [])) : {
      name  = "${h}."
      type  = "A"
      value = google_compute_global_address.lb.address
      why   = "site"
    }],
  )
}

output "github_variables" {
  description = "Repository variables for the deploy workflow (Settings → Secrets and variables → Actions → Variables), per GitHub environment."
  value = {
    GCP_PROJECT_ID        = var.project_id
    GCP_REGION            = var.region
    GCP_WORKLOAD_IDENTITY = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOYER          = google_service_account.deployer.email
    IMAGE_REGISTRY        = local.registry
    WEB_API_MODE          = var.web_api_mode
    DEPLOY_PLATFORM_API   = tostring(local.platform)
  }
}

output "database_instance" {
  value = google_sql_database_instance.db.connection_name
}
