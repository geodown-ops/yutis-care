# ---------------------------------------------------------------- HTTPS load balancer
#
#   {tenant hosts}  /api/*           → tenant API
#                   everything else  → front ends (back office at /, employee portal at /me/)
#   platform host   /platform-api/*  → platform API   ┐ both behind Identity-Aware Proxy
#                   everything else  → front ends     ┘ (Google Workspace accounts in platform_staff)
#   site host       /platform-api/public/*  → platform API, public routes only (trial applications, payment page), never IAP
#                   everything else         → front ends (the marketing site, deploy/site.sh)

resource "google_compute_global_address" "lb" {
  project    = var.project_id
  name       = "${local.prefix}-lb"
  depends_on = [google_project_service.apis]
}

locals {
  # Serverless NEGs name the Cloud Run service as a string, so the platform API can read its own backend id (IAP audience).
  negs = merge(
    { api = "api", web = "web" },
    local.platform ? { platform-api = "platform-api" } : {},
  )
}

resource "google_compute_region_network_endpoint_group" "run" {
  for_each              = local.negs
  project               = var.project_id
  name                  = "${local.prefix}-${each.key}"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = each.value
  }
  depends_on = [google_project_service.apis]
}

# Per-IP request limits in front of the public back ends; sign-in is limited harder.
resource "google_compute_security_policy" "edge" {
  project = var.project_id
  name    = "${local.prefix}-edge"
  type    = "CLOUD_ARMOR"

  rule {
    action   = "throttle"
    priority = 1000
    match {
      expr {
        expression = "request.path.startsWith('/api/auth/') || request.path.startsWith('/api/sign/')"
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 30
        interval_sec = 60
      }
    }
  }

  # The payment page: loading the order, paying, and asking a few times for the 3D Secure result; TapPay's notify too.
  rule {
    action   = "throttle"
    priority = 1050
    match {
      expr {
        expression = "request.path.startsWith('/platform-api/public/payments/')"
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 60
        interval_sec = 60
      }
    }
  }

  # The marketing site's trial application form: a person sends one now and then.
  rule {
    action   = "throttle"
    priority = 1100
    match {
      expr {
        expression = "request.path.startsWith('/platform-api/public/')"
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 10
        interval_sec = 60
      }
    }
  }

  rule {
    action   = "throttle"
    priority = 2000
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 1200
        interval_sec = 60
      }
    }
  }

  rule {
    action   = "allow"
    priority = 2147483647
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_compute_backend_service" "api" {
  project               = var.project_id
  name                  = "${local.prefix}-api"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  security_policy       = google_compute_security_policy.edge.id
  backend {
    group = google_compute_region_network_endpoint_group.run["api"].id
  }
  log_config {
    enable      = true
    sample_rate = 1
  }
}

resource "google_compute_backend_service" "web" {
  project               = var.project_id
  name                  = "${local.prefix}-web"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  security_policy       = google_compute_security_policy.edge.id
  enable_cdn            = false
  backend {
    group = google_compute_region_network_endpoint_group.run["web"].id
  }
}

resource "google_compute_backend_service" "platform_api" {
  count                 = local.platform ? 1 : 0
  project               = var.project_id
  name                  = "${local.prefix}-platform-api"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  backend {
    group = google_compute_region_network_endpoint_group.run["platform-api"].id
  }
  security_policy = local.platform_iap ? null : google_compute_security_policy.edge.id
  iap {
    enabled = local.platform_iap
  }
  log_config {
    enable      = true
    sample_rate = 1
  }
}

# The same front-end service, but behind IAP for the platform host (unless staff sign in with Google instead).
resource "google_compute_backend_service" "platform_web" {
  count                 = local.platform ? 1 : 0
  project               = var.project_id
  name                  = "${local.prefix}-platform-web"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  backend {
    group = google_compute_region_network_endpoint_group.run["web"].id
  }
  security_policy = local.platform_iap ? null : google_compute_security_policy.edge.id
  iap {
    enabled = local.platform_iap
  }
}

# The platform API again, without IAP, for the marketing site's public routes (the URL map sends nothing else to it).
resource "google_compute_backend_service" "site_api" {
  count                 = local.site ? 1 : 0
  project               = var.project_id
  name                  = "${local.prefix}-site-api"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  security_policy       = google_compute_security_policy.edge.id
  backend {
    group = google_compute_region_network_endpoint_group.run["platform-api"].id
  }
  log_config {
    enable      = true
    sample_rate = 1
  }
}

resource "google_iap_web_backend_service_iam_binding" "platform" {
  for_each            = local.platform_iap ? { api = google_compute_backend_service.platform_api[0].name, web = google_compute_backend_service.platform_web[0].name } : {}
  project             = var.project_id
  web_backend_service = each.value
  role                = "roles/iap.httpsResourceAccessor"
  members             = var.platform_staff
}

resource "google_compute_url_map" "https" {
  project         = var.project_id
  name            = "${local.prefix}-https"
  default_service = google_compute_backend_service.web.id

  host_rule {
    hosts        = var.tenant_hosts
    path_matcher = "tenant"
  }
  path_matcher {
    name            = "tenant"
    default_service = google_compute_backend_service.web.id
    path_rule {
      paths   = ["/api", "/api/*"]
      service = google_compute_backend_service.api.id
    }
  }

  dynamic "host_rule" {
    for_each = local.platform ? [1] : []
    content {
      hosts        = [var.platform_host]
      path_matcher = "platform"
    }
  }
  dynamic "path_matcher" {
    for_each = local.platform ? [1] : []
    content {
      name            = "platform"
      default_service = google_compute_backend_service.platform_web[0].id
      path_rule {
        paths   = ["/platform-api", "/platform-api/*"]
        service = google_compute_backend_service.platform_api[0].id
      }
    }
  }

  dynamic "host_rule" {
    for_each = local.site ? [1] : []
    content {
      hosts        = [var.site_host]
      path_matcher = "site"
    }
  }
  dynamic "path_matcher" {
    for_each = local.site ? [1] : []
    content {
      name            = "site"
      default_service = google_compute_backend_service.web.id
      path_rule {
        paths   = ["/platform-api/public/*"]
        service = google_compute_backend_service.site_api[0].id
      }
    }
  }
}

# ---------------------------------------------------------------- certificate (Certificate Manager, DNS-authorized wildcard)

resource "google_certificate_manager_dns_authorization" "this" {
  project    = var.project_id
  name       = "${local.prefix}-${replace(var.certificate_domain, ".", "-")}"
  domain     = var.certificate_domain
  depends_on = [google_project_service.apis]
}

resource "google_certificate_manager_certificate" "this" {
  project = var.project_id
  name    = "${local.prefix}-${var.environment}"
  managed {
    domains            = [var.certificate_domain, "*.${var.certificate_domain}"]
    dns_authorizations = [google_certificate_manager_dns_authorization.this.id]
  }
}

resource "google_certificate_manager_certificate_map" "this" {
  project = var.project_id
  name    = "${local.prefix}-${var.environment}"
}

resource "google_certificate_manager_certificate_map_entry" "this" {
  for_each     = toset([var.certificate_domain, "*.${var.certificate_domain}"])
  project      = var.project_id
  name         = "${local.prefix}-${substr(sha1(each.value), 0, 8)}"
  map          = google_certificate_manager_certificate_map.this.name
  hostname     = each.value
  certificates = [google_certificate_manager_certificate.this.id]
}

resource "google_compute_target_https_proxy" "https" {
  project         = var.project_id
  name            = "${local.prefix}-https"
  url_map         = google_compute_url_map.https.id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.this.id}"
  ssl_policy      = google_compute_ssl_policy.modern.id
}

resource "google_compute_ssl_policy" "modern" {
  project         = var.project_id
  name            = "${local.prefix}-tls12"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project_id
  name                  = "${local.prefix}-https"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.lb.id
  port_range            = "443"
  target                = google_compute_target_https_proxy.https.id
}

# Plain HTTP only redirects to HTTPS.
resource "google_compute_url_map" "redirect" {
  project = var.project_id
  name    = "${local.prefix}-http-redirect"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  project = var.project_id
  name    = "${local.prefix}-http-redirect"
  url_map = google_compute_url_map.redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  project               = var.project_id
  name                  = "${local.prefix}-http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.lb.id
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirect.id
}
