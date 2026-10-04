# 部署：Railway

正式站與示範站各是一個 Railway 專案，不共用資料庫、變數或金鑰。機房選新加坡（`asia-southeast1-eqsg3a`），Railway 目前沒有台灣機房。GCP 的設定（`infra/README.md`、`infra/terraform`）保留，之後要搬回 GCP 台灣也可以。

| | 正式站 `yutis-care-prod` | 示範站 `yutis-care-demo` |
|---|---|---|
| 網址 | `*.care.yutis.net`（租戶、`/me` 員工端、`admin.` 平台管理後台） | 目前 `web-demo-7e93.up.railway.app`，之後 `demo.care.yutis.net` |
| 登入 | Identity Platform（SSO + MFA）；平台人員用 Google 帳號 | 示範登入（不需密碼） |
| 加密 | Cloud KMS，每個租戶一把金鑰 | 一把示範用金鑰（變數） |
| 備份 | Railway 每日備份（Pro 方案）＋每晚加密匯出 | 不需要 |

## 服務

每個服務都從 GitHub `geodown-ops/yutis-care` 建置（Settings → Source），用 Dockerfile（變數 `RAILWAY_DOCKERFILE_PATH`）。只有 `web` 有公開網址；其他服務只在 Railway 的內部網路（`<服務>.railway.internal`）。

| 服務 | Dockerfile | 啟動指令 | 說明 |
|---|---|---|---|
| `Postgres` | Railway 範本 | | 資料表擁有者是 Railway 建立的 `postgres` |
| `api` | `deploy/server.Dockerfile` | `node apps/api/dist/main.js` | Pre-deploy：`sh deploy/release.sh`（migration、資料庫登入角色、背景工作佇列、預設範本；示範站再載入虛構資料） |
| `worker` | `deploy/server.Dockerfile` | `node apps/api/dist/worker/main.js` | 只在正式站需要（匯出、保存期限） |
| `platform-api` | `deploy/server.Dockerfile` | `node apps/platform-api/dist/main.js` | 只在正式站 |
| `web` | `deploy/web.Dockerfile` | | nginx 提供三個前端，並把 `/api`、`/platform-api` 轉給後端，每個 IP 的請求上限與 GCP 的 Cloud Armor 相同 |
| `backup` | `deploy/backup.Dockerfile` | | 只在正式站；Cron `0 19 * * *`（台灣時間 03:00） |

## 變數

密碼（`*_DB_PASSWORD`）請各自產生 32 字元以上的隨機值，只存在 Railway。`${{…}}` 是 Railway 的參照語法。

**api**

```
NODE_ENV=production
PORT=3000
TRUST_PROXY=true
TENANT_BASE_DOMAIN=care.yutis.net
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_DB_PASSWORD=…
WORKER_DB_PASSWORD=…
PLATFORM_DB_PASSWORD=…
APP_DATABASE_URL=postgresql://yutis_api:${{APP_DB_PASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}
PLATFORM_ADMIN_EMAILS=第一位營運人員的 Google 帳號
# 正式站
TENANT_CRYPTO_KMS=true
IDENTITY_PLATFORM_PROJECT_ID=GCP 專案 id
IDENTITY_PLATFORM_API_KEY=瀏覽器 API 金鑰（公開值）
IDENTITY_PLATFORM_AUTH_DOMAIN=<GCP 專案 id>.firebaseapp.com
GOOGLE_SERVICE_ACCOUNT_KEY=服務帳號 yutis-api 的 JSON 金鑰
# 示範站（取代上面四行）
DEMO_SITE=true
AUTH_DEV_SIGN_IN=true
TENANT_CRYPTO_LOCAL_KEY=32 bytes 的 base64
```

**worker**：`NODE_ENV=production`、`WORKER_DATABASE_URL=postgresql://yutis_worker_login:${{api.WORKER_DB_PASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}`、`TENANT_CRYPTO_KMS=true`、`GOOGLE_SERVICE_ACCOUNT_KEY`（同 api）。

**platform-api**

```
NODE_ENV=production
PORT=3001
TRUST_PROXY=true
TENANT_BASE_DOMAIN=care.yutis.net
PLATFORM_DATABASE_URL=postgresql://yutis_platform_api:${{api.PLATFORM_DB_PASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}
GCP_PROJECT_ID=GCP 專案 id
KMS_KEY_RING=projects/<GCP 專案 id>/locations/asia-east1/keyRings/tenants
PLATFORM_SIGN_IN_PROJECT_ID=GCP 專案 id
PLATFORM_SIGN_IN_API_KEY=同上的瀏覽器 API 金鑰
PLATFORM_SIGN_IN_AUTH_DOMAIN=<GCP 專案 id>.firebaseapp.com
GOOGLE_SERVICE_ACCOUNT_KEY=服務帳號 yutis-platform 的 JSON 金鑰
```

**web**：`PORT=8080`、`API_UPSTREAM=api.railway.internal:3000`、`PLATFORM_API_UPSTREAM=platform-api.railway.internal:3001`（示範站不設）、`VITE_API=live`（前端畫面串接 API 之後；在那之前是 `demo`，用畫面內建的虛構資料）。

**backup**：`DATABASE_URL=${{Postgres.DATABASE_URL}}`、`BACKUP_AGE_RECIPIENT`（age 公鑰，私鑰離線保管）、`BACKUP_BUCKET`、`BACKUP_ENDPOINT`、`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`（Railway Bucket 或任何 S3 相容儲存）、選填 `BACKUP_KEEP_DAYS`（預設 35）。還原：`age -d -i key.txt 檔案 | pg_restore --clean --no-owner -d "$DATABASE_URL"`。

## GCP（只用登入與金鑰）

正式站仍需要一個 GCP 專案，但只開 Identity Platform 與 Cloud KMS，不建 Cloud Run 或 Cloud SQL：

1. 啟用 Identity Platform，開啟多租戶（Settings → Security → Allow tenants），並在專案層級（不是租戶）啟用 Google 登入提供者，給平台人員用；授權網域加上 `admin.care.yutis.net`。
2. 在 `asia-east1` 建立 KMS 金鑰環 `tenants`。
3. 兩個服務帳號，各建一把 JSON 金鑰放進 Railway：
   - `yutis-api`（api、worker）：金鑰環上的 `roles/cloudkms.cryptoKeyEncrypterDecrypter`，專案的 `roles/identityplatform.viewer`。
   - `yutis-platform`（platform-api）：金鑰環上的 `roles/cloudkms.admin`，專案的 `roles/identityplatform.admin`。
4. API 金鑰（瀏覽器用）：限制 HTTP referrer 為 `https://*.care.yutis.net/*`，API 限制為 Identity Toolkit 與 Token Service。

## 網域與 DNS

在 `web` 服務 → Settings → Networking 新增自訂網域 `*.care.yutis.net`（正式站）與 `demo.care.yutis.net`（示範站），依 Railway 顯示的紀錄在 DNS 新增 CNAME 與驗證用的 TXT，Railway 會自動簽發憑證。

## 跟 GCP 部署的差異

- 資料存放在新加坡：隱私權政策與客戶的個資委託處理約定要寫明跨境存放（請法務確認）。
- 沒有雙區高可用與回到任一時間點的還原；以 Railway 每日備份加每晚加密匯出補足，最多可能遺失一天的資料。
- 平台管理後台沒有 IAP 在前面，改由 platform-api 驗證 Google 登入的 ID token，並且只接受 `platform_users` 裡啟用中的帳號。登入頁要用 `GET /platform-api/sign-in-config` 的設定（前端 UX 討論串）。
- 寄信（員工邀請信、附表八簽核信）：預計用 Resend，變數 `EMAIL_PROVIDER`、`RESEND_API_KEY`、`EMAIL_FROM`（寄送程式另外實作）。
