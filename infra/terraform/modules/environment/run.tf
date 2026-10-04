# ---------------------------------------------------------------- Cloud Run
#
# Terraform owns the configuration; the deploy workflow only changes the image (hence ignore_changes on it). The first
# apply starts them on Google's placeholder image until the first deploy.

locals {
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"
  registry          = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"

  demo_env = var.demo_site ? { DEMO_SITE = "true" } : {}
  # Production: per-tenant keys wrapped by Cloud KMS, sign-in through Identity Platform. Demo: local key, dev sign-in.
  kms_env = var.demo_site ? {} : { TENANT_CRYPTO_KMS = "true" }
  sign_in_env = var.demo_site ? { AUTH_DEV_SIGN_IN = "true" } : var.identity_platform ? {
    IDENTITY_PLATFORM_PROJECT_ID  = var.project_id
    IDENTITY_PLATFORM_API_KEY     = nonsensitive(google_apikeys_key.browser[0].key_string) # a public browser key
    IDENTITY_PLATFORM_AUTH_DOMAIN = "${var.project_id}.firebaseapp.com"
  } : {}
  api_env = merge({
    NODE_ENV           = "production"
    TRUST_PROXY        = "true"
    TENANT_BASE_DOMAIN = var.tenant_base_domain
  }, local.demo_env, local.kms_env, local.sign_in_env, local.email_env)
  worker_env   = merge({ NODE_ENV = "production" }, local.demo_env, local.kms_env)
  demo_secrets = var.demo_site ? { TENANT_CRYPTO_LOCAL_KEY = "tenant-crypto-local-key" } : {}
  # Invitations and sign-off links: sent through Resend once email_from is set, otherwise only logged.
  send_email = !var.demo_site && var.email_from != ""
  email_env  = local.send_email ? { EMAIL_PROVIDER = "resend", EMAIL_FROM = var.email_from } : {}
}

resource "google_cloud_run_v2_service" "api" {
  project              = var.project_id
  name                 = "api"
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  invoker_iam_disabled = true # only reachable through the load balancer; the API does its own sign-in
  deletion_protection  = false
  depends_on           = [google_secret_manager_secret_iam_member.access, google_secret_manager_secret_version.s]

  template {
    service_account = google_service_account.run["api"].email
    scaling {
      min_instance_count = var.api_min_instances
      max_instance_count = 10
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.run.id
      }
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.db.connection_name]
      }
    }
    containers {
      image   = local.placeholder_image
      command = ["node", "apps/api/dist/main.js"]
      resources {
        limits = { cpu = "1", memory = "1Gi" }
      }
      dynamic "env" {
        for_each = local.api_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = merge({ APP_DATABASE_URL = "db-url-api" }, local.demo_secrets)
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.s[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
      dynamic "env" {
        for_each = local.send_email ? [google_secret_manager_secret.resend[0].secret_id] : []
        content {
          name = "RESEND_API_KEY"
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

# pg-boss worker: exports and the nightly retention scan. Exactly one instance, CPU always on.
resource "google_cloud_run_v2_service" "worker" {
  project             = var.project_id
  name                = "worker"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false
  depends_on          = [google_secret_manager_secret_iam_member.access, google_secret_manager_secret_version.s]

  template {
    service_account = google_service_account.run["worker"].email
    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.run.id
      }
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.db.connection_name]
      }
    }
    containers {
      image   = local.placeholder_image
      command = ["node", "apps/api/dist/worker/main.js"]
      resources {
        cpu_idle = false
        limits   = { cpu = "1", memory = "1Gi" }
      }
      dynamic "env" {
        for_each = local.worker_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = merge({ WORKER_DATABASE_URL = "db-url-worker" }, local.demo_secrets)
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.s[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

resource "google_cloud_run_v2_service" "platform_api" {
  count                = local.platform ? 1 : 0
  project              = var.project_id
  name                 = "platform-api"
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  invoker_iam_disabled = true # Identity-Aware Proxy at the load balancer; the API verifies the IAP JWT itself
  deletion_protection  = false
  depends_on           = [google_secret_manager_secret_iam_member.access, google_secret_manager_secret_version.s]

  template {
    service_account = google_service_account.run["platform"].email
    scaling {
      max_instance_count = 2
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.run.id
      }
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.db.connection_name]
      }
    }
    containers {
      image   = local.placeholder_image
      command = ["node", "apps/platform-api/dist/main.js"]
      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "TRUST_PROXY"
        value = "true"
      }
      env {
        name  = "TENANT_BASE_DOMAIN"
        value = var.tenant_base_domain
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "KMS_KEY_RING"
        value = google_kms_key_ring.tenants.id
      }
      env {
        name  = "IAP_AUDIENCE"
        value = "/projects/${data.google_project.this.number}/global/backendServices/${google_compute_backend_service.platform_api[0].generated_id}"
      }
      env {
        name = "PLATFORM_DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.s["db-url-platform"].secret_id
            version = "latest"
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

resource "google_cloud_run_v2_service" "web" {
  project              = var.project_id
  name                 = "web"
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  invoker_iam_disabled = true
  deletion_protection  = false

  template {
    service_account = google_service_account.run["web"].email
    scaling {
      max_instance_count = 5
    }
    containers {
      image = local.placeholder_image
      resources {
        limits = { cpu = "1", memory = "256Mi" }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

# ---------------------------------------------------------------- release job (deploy/release.sh: migrations, login roles, job queues, templates, demo data)

resource "google_cloud_run_v2_job" "release" {
  project             = var.project_id
  name                = "release"
  location            = var.region
  deletion_protection = false
  depends_on          = [google_secret_manager_secret_iam_member.access, google_secret_manager_secret_version.s, google_sql_user.owner]

  template {
    task_count = 1
    template {
      service_account = google_service_account.run["release"].email
      max_retries     = 0
      timeout         = "900s"
      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.vpc.id
          subnetwork = google_compute_subnetwork.run.id
        }
      }
      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.db.connection_name]
        }
      }
      containers {
        image   = local.placeholder_image
        command = ["sh", "deploy/release.sh"]
        env {
          name  = "NODE_ENV"
          value = "production"
        }
        env {
          name  = "DEMO_SITE"
          value = tostring(var.demo_site)
        }
        env {
          name  = "PLATFORM_ADMIN_EMAILS"
          value = join(",", var.platform_admin_emails)
        }
        dynamic "env" {
          for_each = merge({
            DATABASE_URL         = "db-url-owner"
            APP_DB_PASSWORD      = "db-password-api"
            WORKER_DB_PASSWORD   = "db-password-worker"
            PLATFORM_DB_PASSWORD = "db-password-platform"
          }, local.demo_secrets)
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.s[env.value].secret_id
                version = "latest"
              }
            }
          }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
}

# ---------------------------------------------------------------- demo site: back to clean fictional data every night

resource "google_service_account" "demo_reset" {
  count        = var.demo_site ? 1 : 0
  project      = var.project_id
  account_id   = "demo-reset"
  display_name = "Nightly demo data reset"
}

resource "google_cloud_run_v2_job_iam_member" "demo_reset" {
  count    = var.demo_site ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.release.name
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = google_service_account.demo_reset[0].member
}

resource "google_cloud_scheduler_job" "demo_reset" {
  count     = var.demo_site ? 1 : 0
  project   = var.project_id
  region    = var.region
  name      = "demo-reset"
  schedule  = "0 4 * * *"
  time_zone = "Asia/Taipei"

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/${google_cloud_run_v2_job.release.id}:run"
    body = base64encode(jsonencode({
      overrides = { containerOverrides = [{ env = [{ name = "RESET_DEMO_DATABASE", value = "true" }] }] }
    }))
    headers = { "Content-Type" = "application/json" }
    oauth_token {
      service_account_email = google_service_account.demo_reset[0].email
    }
  }
  depends_on = [google_project_service.apis]
}
