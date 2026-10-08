# ---------------------------------------------------------------- card payments (TapPay), production only
#
# The platform API charges cards for payment orders (付款單) through TapPay. TapPay's production API only accepts calls
# from addresses listed in its portal (後台 IP 限制), so with payments on the platform API sends all its outbound
# traffic through Cloud NAT on one reserved address (output payment_egress_ip) instead of Cloud Run's shared ones.

locals {
  # The payment page lives on the marketing site, whose /platform-api/public/* reaches the platform API.
  payments_possible = local.site && !var.demo_site
  payments          = local.payments_possible && var.tappay != null
  tappay_env = local.payments ? merge({
    TAPPAY_ENV         = var.tappay.env
    TAPPAY_APP_ID      = tostring(var.tappay.app_id)
    TAPPAY_APP_KEY     = var.tappay.app_key
    TAPPAY_MERCHANT_ID = var.tappay.merchant_id
  }, var.tappay.use_3ds == null ? {} : { TAPPAY_USE_3DS = tostring(var.tappay.use_3ds) }) : {}
}

# TapPay partner key. Terraform creates the secret but never sees the key: add it with
#   printf %s 'partner_…' | gcloud secrets versions add tappay-partner-key --data-file=- --project <project>
# before setting tappay.
resource "google_secret_manager_secret" "tappay" {
  count     = local.payments_possible ? 1 : 0
  project   = var.project_id
  secret_id = "tappay-partner-key"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "tappay" {
  count     = local.payments_possible ? 1 : 0
  project   = var.project_id
  secret_id = google_secret_manager_secret.tappay[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run["platform"].member
}

resource "google_compute_address" "egress" {
  count   = local.payments ? 1 : 0
  project = var.project_id
  name    = "${local.prefix}-egress"
  region  = var.region
}

resource "google_compute_router" "egress" {
  count   = local.payments ? 1 : 0
  project = var.project_id
  name    = "${local.prefix}-egress"
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "egress" {
  count                              = local.payments ? 1 : 0
  project                            = var.project_id
  name                               = "${local.prefix}-egress"
  region                             = var.region
  router                             = google_compute_router.egress[0].name
  nat_ip_allocate_option             = "MANUAL_ONLY"
  nat_ips                            = [google_compute_address.egress[0].self_link]
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"
  subnetwork {
    name                    = google_compute_subnetwork.run.id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }
}
