# ---------------------------------------------------------------- runtime service accounts (one per workload)

locals {
  runtime_accounts = {
    api      = "Tenant API"
    worker   = "Background worker"
    platform = "Platform API"
    web      = "Front ends (nginx)"
    release  = "Release job (migrations)"
  }
  # Which secrets each workload may read.
  secret_access = merge(
    {
      api      = ["db-url-api"]
      worker   = ["db-url-worker"]
      platform = ["db-url-platform"]
      release  = ["db-url-owner", "db-password-api", "db-password-worker", "db-password-platform"]
      web      = []
    },
    var.demo_site ? {
      api    = ["db-url-api", "tenant-crypto-local-key"]
      worker = ["db-url-worker", "tenant-crypto-local-key"]
    } : {},
  )
  secret_bindings = merge([
    for account, secrets in local.secret_access : { for s in secrets : "${account}/${s}" => { account = account, secret = s } }
  ]...)
}

resource "google_service_account" "run" {
  for_each     = local.runtime_accounts
  project      = var.project_id
  account_id   = "run-${each.key}"
  display_name = "Yutis Care ${each.value}"
  depends_on   = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "access" {
  for_each  = local.secret_bindings
  project   = var.project_id
  secret_id = google_secret_manager_secret.s[each.value.secret].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run[each.value.account].member
}

resource "google_project_iam_member" "sql_client" {
  for_each = toset(["api", "worker", "platform", "release"])
  project  = var.project_id
  role     = "roles/cloudsql.client"
  member   = google_service_account.run[each.value].member
}

resource "google_project_iam_member" "telemetry" {
  for_each = { for pair in setproduct(keys(local.runtime_accounts), ["roles/logging.logWriter", "roles/monitoring.metricWriter", "roles/cloudtrace.agent"]) : "${pair[0]}/${pair[1]}" => pair }
  project  = var.project_id
  role     = each.value[1]
  member   = google_service_account.run[each.value[0]].member
}

# The tenant API and worker unwrap tenant data keys; the platform API creates and destroys the per-tenant keys.
resource "google_kms_key_ring_iam_member" "use_keys" {
  for_each    = toset(["api", "worker"])
  key_ring_id = google_kms_key_ring.tenants.id
  role        = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member      = google_service_account.run[each.value].member
}

resource "google_kms_key_ring_iam_member" "manage_keys" {
  count       = local.platform ? 1 : 0
  key_ring_id = google_kms_key_ring.tenants.id
  role        = "roles/cloudkms.admin"
  member      = google_service_account.run["platform"].member
}

resource "google_project_iam_member" "platform_identity" {
  count   = local.platform && var.identity_platform ? 1 : 0
  project = var.project_id
  role    = "roles/identityplatform.admin"
  member  = google_service_account.run["platform"].member
}

# ---------------------------------------------------------------- GitHub Actions deploys (no service account keys)

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "yutis-care"
  display_name                       = "geodown-ops/yutis-care"
  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.repository"  = "assertion.repository"
    "attribute.environment" = "assertion.environment"
  }
  # Only jobs of this repository running in this environment's GitHub environment.
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.environment == '${var.github_environment}'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "github-deployer"
  display_name = "GitHub Actions deployer"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_project_iam_member" "deployer" {
  for_each = toset(["roles/run.developer"])
  project  = var.project_id
  role     = each.value
  member   = google_service_account.deployer.member
}

resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  project    = var.project_id
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer.member
}

# Deploying a revision that runs as a runtime account requires acting as it.
resource "google_service_account_iam_member" "deployer_act_as" {
  for_each           = google_service_account.run
  service_account_id = each.value.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}
