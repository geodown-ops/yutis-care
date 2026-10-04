/*
 * One Yutis Care environment in its own GCP project: network, Cloud SQL, secrets, KMS key ring, Cloud Run services,
 * the release job, and the load balancer. Production and the demo site are two instances of this module in two
 * projects, so they share no database, key, service account or secret.
 */

locals {
  prefix   = "yutis"
  platform = var.platform_host != null
  # Identity-Aware Proxy in front of the platform back office, unless staff sign in with Google instead.
  platform_iap = local.platform && !var.platform_sign_in
  services = [
    "apikeys.googleapis.com",
    "artifactregistry.googleapis.com",
    "certificatemanager.googleapis.com",
    "cloudkms.googleapis.com",
    "cloudscheduler.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "iap.googleapis.com",
    "identitytoolkit.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "securetoken.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ]
}

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------- network (Cloud SQL has a private IP only)

resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = local.prefix
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "run" {
  project                  = var.project_id
  name                     = "${local.prefix}-run"
  region                   = var.region
  network                  = google_compute_network.vpc.id
  ip_cidr_range            = "10.10.0.0/24"
  private_ip_google_access = true
}

resource "google_compute_global_address" "private_services" {
  project       = var.project_id
  name          = "${local.prefix}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

# ---------------------------------------------------------------- Cloud SQL (PostgreSQL 16)

resource "google_sql_database_instance" "db" {
  project             = var.project_id
  name                = "${local.prefix}-${var.environment}"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.deletion_protection
  depends_on          = [google_service_networking_connection.private_services]

  settings {
    edition                     = "ENTERPRISE"
    tier                        = var.database_tier
    availability_type           = var.database_high_availability ? "REGIONAL" : "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = var.database_disk_gb
    disk_autoresize             = true
    deletion_protection_enabled = var.deletion_protection

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "18:00" # 02:00 Taiwan time
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = var.backup_retention_days
      }
    }

    maintenance_window {
      day          = 7  # Sunday
      hour         = 19 # 03:00 Taiwan time, Monday
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled = true
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }
  }
}

resource "google_sql_database" "yutis" {
  project  = var.project_id
  instance = google_sql_database_instance.db.name
  name     = "yutis"
}

resource "random_password" "db" {
  for_each = toset(["owner", "api", "worker", "platform"])
  length   = 40
  special  = false
}

# Owns the tables and runs migrations (release job only). The services log in with roles the release job creates.
resource "google_sql_user" "owner" {
  project  = var.project_id
  instance = google_sql_database_instance.db.name
  name     = "yutis_owner"
  password = random_password.db["owner"].result
}

locals {
  socket = "/cloudsql/${google_sql_database_instance.db.connection_name}"
  db_url = {
    owner    = "postgresql://yutis_owner:${random_password.db["owner"].result}@localhost/yutis?host=${local.socket}"
    api      = "postgresql://yutis_api:${random_password.db["api"].result}@localhost/yutis?host=${local.socket}"
    worker   = "postgresql://yutis_worker_login:${random_password.db["worker"].result}@localhost/yutis?host=${local.socket}"
    platform = "postgresql://yutis_platform_api:${random_password.db["platform"].result}@localhost/yutis?host=${local.socket}"
  }
}

# ---------------------------------------------------------------- secrets

locals {
  secret_ids = concat(
    ["db-url-owner", "db-url-api", "db-url-worker", "db-url-platform", "db-password-api", "db-password-worker", "db-password-platform"],
    var.demo_site ? ["tenant-crypto-local-key"] : [],
  )
  secret_values = merge(
    { for k, v in local.db_url : "db-url-${k}" => v },
    { for k in ["api", "worker", "platform"] : "db-password-${k}" => random_password.db[k].result },
    var.demo_site ? { "tenant-crypto-local-key" = random_id.demo_crypto_key[0].b64_std } : {},
  )
}

# The demo site has no Cloud KMS keys per tenant; its fictional data is encrypted with this key instead.
resource "random_id" "demo_crypto_key" {
  count       = var.demo_site ? 1 : 0
  byte_length = 32
}

resource "google_secret_manager_secret" "s" {
  for_each  = toset(local.secret_ids)
  project   = var.project_id
  secret_id = each.value
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "s" {
  for_each    = google_secret_manager_secret.s
  secret      = each.value.id
  secret_data = local.secret_values[each.key]
}

# Resend API key for sending email (production only). Terraform creates the secret but never sees the key: add it with
#   printf %s 're_…' | gcloud secrets versions add resend-api-key --data-file=- --project <project>
# before setting email_from.
resource "google_secret_manager_secret" "resend" {
  count     = var.demo_site ? 0 : 1
  project   = var.project_id
  secret_id = "resend-api-key"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "resend" {
  count     = var.demo_site ? 0 : 1
  project   = var.project_id
  secret_id = google_secret_manager_secret.resend[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run["api"].member
}

# ---------------------------------------------------------------- Cloud KMS: one key per tenant, created by the platform API

resource "google_kms_key_ring" "tenants" {
  project    = var.project_id
  name       = "tenants"
  location   = var.region
  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------- Identity Platform (tenant and employee sign-in)

resource "google_identity_platform_config" "this" {
  count   = var.identity_platform ? 1 : 0
  project = var.project_id
  multi_tenant {
    allow_tenants = true
  }
  authorized_domains = distinct(concat([var.certificate_domain, "${var.project_id}.firebaseapp.com"], [for h in var.tenant_hosts : trimprefix(h, "*.")], local.platform && var.platform_sign_in ? [var.platform_host] : []))
  depends_on         = [google_project_service.apis]
  lifecycle {
    # The platform API adds each tenant's own domain ({slug}.care.yutis.com.tw) when it onboards the tenant.
    ignore_changes = [authorized_domains]
  }
}

# The browser API key the sign-in page uses with Identity Platform (public by design, limited to Identity Toolkit and
# our own pages).
resource "google_apikeys_key" "browser" {
  count        = var.identity_platform ? 1 : 0
  project      = var.project_id
  name         = "sign-in-browser"
  display_name = "Sign-in page (Identity Platform)"
  restrictions {
    api_targets {
      service = "identitytoolkit.googleapis.com"
    }
    api_targets {
      service = "securetoken.googleapis.com"
    }
    browser_key_restrictions {
      allowed_referrers = distinct(concat([for h in var.tenant_hosts : "https://${h}/*"], ["https://${var.project_id}.firebaseapp.com/*"]))
    }
  }
  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------- container images

resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = local.prefix
  format        = "DOCKER"
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s"
    }
  }
  depends_on = [google_project_service.apis]
}
