# 部署：正式站與示範站

> 目前正式站與示範站部署在 Railway，見 [RAILWAY.md](RAILWAY.md)。下面是 GCP 台灣的部署方式，保留供日後搬回。

兩個完全分開的環境，各自一個 GCP 專案（台灣 asia-east1），不共用資料庫、金鑰、服務帳號或密碼：

| | 正式站 | 示範站 |
|---|---|---|
| 網址 | 租戶 `{租戶}.care.yutis.com.tw`、員工端 `/me`、平台管理後台 `admin.care.yutis.com.tw` | `demo.care.yutis.com.tw`、員工端 `demo.care.yutis.com.tw/me` |
| 資料 | 客戶真實資料 | 只有虛構示範資料，每晚 04:00 自動重置 |
| 登入 | 租戶 SSO（Identity Platform）+ MFA；平台人員經 Identity-Aware Proxy | 示範登入（不需密碼），只能進入虛構的示範租戶 |
| 加密 | 每個租戶一把 Cloud KMS 金鑰 | 一把示範用金鑰（Secret Manager） |
| 資料庫 | Cloud SQL PostgreSQL 16，雙區高可用、每日備份保留 30 天、可回到 7 天內任一時間點、防刪除 | 單區小型機器，備份 7 天 |
| 部署 | 手動觸發並需核准（GitHub「production」環境） | `main` 合併後自動部署 |
| Terraform | `infra/terraform/production` | `infra/terraform/demo` |

每個環境的內容（`infra/terraform/modules/environment`）：

- **Cloud Run**：`api`（租戶 API）、`worker`（背景工作，固定一台）、`platform-api`（只在正式站）、`web`（nginx 提供三個前端）、`release` 工作（每次部署先跑 `deploy/release.sh`：migration、建立資料庫登入角色、背景工作佇列、發布預設範本；示範站再載入虛構示範資料）。
- **Cloud SQL** 只有內部 IP，服務透過 Cloud SQL 連線器存取。API、worker、平台 API 各自以只屬於 `yutis_app`／`yutis_worker`／`yutis_platform` 的登入角色連線（Row-Level Security 一定生效）；資料表擁有者 `yutis_owner` 只給 release 工作用。
- **Secret Manager** 存資料庫連線字串與密碼（Terraform 產生，沒有人需要知道）。
- **Cloud KMS** 金鑰環 `tenants`：平台 API 開通租戶時建立該租戶的金鑰，租戶 API 與 worker 只能用它加解密。
- **HTTPS 負載平衡器**：萬用字元憑證（Certificate Manager，DNS 驗證）、HTTP 一律轉 HTTPS、TLS 1.2 以上、Cloud Armor 每個 IP 的請求上限（登入與簽核連結更嚴）。平台管理後台前面是 Identity-Aware Proxy，只有指定的 Google Workspace 帳號能進。
- **GitHub Actions** 以 Workload Identity Federation 部署（沒有任何服務帳號金鑰），而且只接受本 repo 在對應 GitHub 環境中執行的工作。
- 選用：網站停擺與 API 5xx 的 Email 告警。

## 需要你準備的

1. **GCP 帳單帳戶**，並建立兩個專案（名稱可自訂），例如 `yutis-care-prod`、`yutis-care-demo`，都連到帳單帳戶。
2. **Terraform 狀態用的 Cloud Storage bucket**（建在正式站專案、asia-east1、開啟版本控制），例如 `yutis-care-tfstate`。
3. **yutis.com.tw 的 DNS 管理權限**：要新增下面「DNS 紀錄」那幾筆。
4. **平台人員的 Google Workspace 帳號或群組**：誰能進平台管理後台，以及誰第一次部署時拿到「營運」角色。
5. **告警收件 Email**（選用）。
6. 在 GitHub repo 的 Settings → Environments 建立 `production` 與 `demo` 兩個環境；`production` 請設定 Required reviewers（你自己），之後每次正式部署都要你按核准。

## 第一次建立（由有專案擁有者權限的人執行）

```bash
gcloud auth application-default login

# 狀態 bucket（只做一次）
gcloud storage buckets create gs://yutis-care-tfstate --project yutis-care-prod --location asia-east1 --uniform-bucket-level-access
gcloud storage buckets update gs://yutis-care-tfstate --versioning

# 示範站
cd infra/terraform/demo
cp terraform.tfvars.example terraform.tfvars      # 填入專案 id
terraform init -backend-config="bucket=yutis-care-tfstate"
terraform apply

# 正式站
cd ../production
cp terraform.tfvars.example terraform.tfvars      # 填入專案 id、平台人員、營運帳號
terraform init -backend-config="bucket=yutis-care-tfstate"
terraform apply
```

`terraform apply` 結束時會列出：

- `dns_records`：要在 DNS 新增的紀錄。
- `github_variables`：要填到 GitHub 對應環境（Settings → Environments → production／demo → Environment variables）的變數。

服務一開始跑的是 Google 的佔位映像，第一次部署後才是 Yutis Care。

### DNS 紀錄

| 名稱 | 類型 | 值 | 用途 |
|---|---|---|---|
| `_acme-challenge.care.yutis.com.tw` | CNAME | 見正式站 `dns_records` | 正式站憑證驗證（保留，續約要用） |
| `*.care.yutis.com.tw` | A | 正式站 `load_balancer_ip` | 所有租戶與平台管理後台 |
| `_acme-challenge.demo.care.yutis.com.tw` | CNAME | 見示範站 `dns_records` | 示範站憑證驗證 |
| `demo.care.yutis.com.tw` | A | 示範站 `load_balancer_ip` | 示範站（比萬用字元優先） |

憑證在 DNS 生效後通常數十分鐘內簽發。

### GitHub 設定

- 每個環境填入 `github_variables` 的 7 個變數，另外可設 `SITE_URL`（示範站 `https://demo.care.yutis.com.tw`；正式站填一個租戶網址），部署完會檢查它是否正常。
- 都設好後，在 repo 層級（Settings → Secrets and variables → Actions → Variables）新增 `DEPLOY_ENABLED` = `true`。在這之前部署流程不會執行。

## 部署

- **示範站**：合併到 `main` 就自動部署。
- **正式站**：Actions → Deploy → Run workflow → 選 `production`，核准後執行。

每次部署：建置兩個映像（後端一個、前端一個）→ 執行 `release` 工作（migration 等，失敗就停止，不會換版）→ 依序更新 `api`、`worker`、`platform-api`、`web`。Cloud Run 保留舊版本，出問題可在主控台把流量切回上一版（資料庫 migration 不會自動回復，所以 migration 必須向下相容）。

## 示範站

- 前端目前用畫面內建的虛構資料與角色切換（`WEB_API_MODE=demo`），不需要後端就能完整展示；畫面串接 API 後改成 `live`，就會改用示範站資料庫裡的虛構示範租戶。
- 示範租戶的子網域就是 `demo`，所以正式站的平台後台不允許開通名為 `demo` 的租戶。
- 每晚 04:00 由 Cloud Scheduler 執行 `release` 工作並帶 `RESET_DEMO_DATABASE=true`，清空後重新載入虛構資料（原型 `prototype/data.js` 的員工、健檢、四大計畫、事件與個案）。這個重置只在 `DEMO_SITE=true` 而且資料庫裡沒有其他租戶時才會執行，正式站不可能被重置。
- 示範站可以不用密碼登入（例如 `nurse@demo.test`），請不要在示範站輸入任何真實個人資料。

## 登入與加密（正式站）

- **登入**：每個租戶在 Identity Platform 有自己的登入租戶，平台後台開通時自動建立，並把 `{租戶}.care.yutis.com.tw` 加入授權網域。第一位租戶管理員會收到 Identity Platform 寄出的登入連結信（開到 `{租戶}.care.yutis.com.tw/login`）。客戶要用公司帳號登入（Entra ID、Google Workspace、其他 SAML／OIDC）時，在 GCP 主控台 → Identity Platform → 租戶 → 該租戶 → 新增提供者；登入頁會自動出現那個按鈕。租戶 API 會確認 ID token 來自這個子網域自己的登入租戶。
- 邀請信的寄件名稱與內容在 Identity Platform → 設定 → 範本（建議改成中文、寄件者名稱 Yutis Care）。
- **加密**：每個租戶一把 Cloud KMS 金鑰（開通時建立，每 90 天自動輪替）。租戶第一次寫入加密欄位時，租戶 API 產生資料金鑰並用 KMS 包裝存在 `tenant_keys`；之後每個程式只向 KMS 解開一次。銷毀租戶的 KMS 金鑰，該租戶的加密資料就再也無法讀取。

## 正式營運前還沒完成的

部署設定完成不代表可以開始放客戶資料。以下是還缺的部分：

1. **前端畫面串接 API 與登入頁**（「前端 UX 設計」討論串進行中）：三個前端目前還是骨架與示範資料；登入頁要用 Firebase Auth SDK 完成 SSO 與 Email 連結登入，再把 ID token 交給 `POST /api/auth/sign-in`。`GET /api/tenant` 會提供登入頁需要的 `identityPlatform` 設定。
2. **職醫校正**：健檢分級門檻與心血管風險的示意數值，需職醫依指引校正。
3. **法務確認**：保存年限（一般 7 年、特殊 10 年）、隱私權政策與客戶的個資委託處理約定。
4. **第一次部署後的實際驗證**：在正式站建立一個測試租戶，走一次開通、收邀請信、登入、匯入員工、寫入加密欄位，確認 KMS 與 Identity Platform 權限都正確，再開通真正的客戶。
