#!/bin/bash
# First creation of the production site, run by the project owner in Cloud Shell (console.cloud.google.com → >_):
#   git clone https://github.com/geodown-ops/yutis-care.git && cd yutis-care && bash infra/bootstrap-production.sh <project id> [domain]
# Creates the Terraform state bucket and terraform.tfvars (the signed-in account becomes the first 營運 staff), then runs
# terraform apply, which shows the plan and asks for "yes" before creating anything. Safe to run again.
set -euo pipefail
project="${1:?usage: bash infra/bootstrap-production.sh <project id> [domain]}"
domain="${2:-care.yutis.com.tw}"
me="$(gcloud config get-value account 2>/dev/null)"
cd "$(dirname "$0")/terraform/production"

gcloud config set project "$project" >/dev/null
if [ "$(gcloud billing projects describe "$project" --format='value(billingEnabled)')" != "True" ]; then
  echo "專案 $project 還沒有連結帳單帳戶：請到 帳單 → 我的專案 連結後再執行。" >&2
  exit 1
fi
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com

# Inside a Google Workspace organization (and signed in with a Workspace account), IAP guards the platform back office;
# with a personal Gmail account IAP's Google-managed client would admit no one, so staff sign in with Google instead.
sign_in=true
if [ "$(gcloud projects describe "$project" --format='value(parent.type)')" = "organization" ] && [[ "$me" != *@gmail.com ]]; then
  sign_in=false
fi

bucket="$project-tfstate"
if ! gcloud storage buckets describe "gs://$bucket" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$bucket" --location asia-east1 --uniform-bucket-level-access
  gcloud storage buckets update "gs://$bucket" --versioning
fi

if [ ! -f terraform.tfvars ]; then
  cat > terraform.tfvars <<TFVARS
project_id            = "$project"
domain                = "$domain"
platform_admin_emails = ["$me"]
platform_staff        = ["user:$me"]
platform_sign_in      = $sign_in
alert_email           = "$me"
TFVARS
fi
echo "terraform.tfvars:"; cat terraform.tfvars

terraform init -input=false -backend-config="bucket=$bucket"
terraform apply
