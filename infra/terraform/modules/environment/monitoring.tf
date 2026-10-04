# ---------------------------------------------------------------- uptime check and alerts (optional)

resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_email != null ? 1 : 0
  project      = var.project_id
  display_name = "Yutis Care ${var.environment} alerts"
  type         = "email"
  labels       = { email_address = var.alert_email }
  depends_on   = [google_project_service.apis]
}

locals {
  # A concrete host to probe: the first tenant host without a wildcard, else the certificate domain's demo tenant.
  probe_host = try([for h in var.tenant_hosts : h if !startswith(h, "*.")][0], var.certificate_domain)
}

resource "google_monitoring_uptime_check_config" "web" {
  count        = var.alert_email != null ? 1 : 0
  project      = var.project_id
  display_name = "Yutis Care ${var.environment} front end"
  timeout      = "10s"
  period       = "300s"
  http_check {
    path         = "/healthz"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }
  monitored_resource {
    type   = "uptime_url"
    labels = { project_id = var.project_id, host = local.probe_host }
  }
  # A new host replaces the check, and Google refuses to delete one an alert policy still uses: create the new check,
  # repoint the policy, then delete the old one.
  lifecycle {
    create_before_destroy = true
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  count        = var.alert_email != null ? 1 : 0
  project      = var.project_id
  display_name = "Yutis Care ${var.environment} is down"
  combiner     = "OR"
  conditions {
    display_name = "Uptime check failing"
    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${google_monitoring_uptime_check_config.web[0].uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "300s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email[0].id]
}

resource "google_monitoring_alert_policy" "errors" {
  count        = var.alert_email != null ? 1 : 0
  project      = var.project_id
  display_name = "Yutis Care ${var.environment} API 5xx"
  combiner     = "OR"
  conditions {
    display_name = "More than 10 server errors in 5 minutes"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"api\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 10
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email[0].id]
}
