# Yutis Care

職場員工健康照護平台，給職護、職醫管理員工健康與職業衛生四大計畫。正式版為多租戶 SaaS，部署於 Google Cloud 台灣區域，架構見 [docs/architecture.md](docs/architecture.md)。

## 專案結構

| 路徑 | 內容 |
|---|---|
| `packages/domain` | 健康管理規則（TypeScript，前後端共用） |
| `packages/db` | PostgreSQL schema（Drizzle）、migration、租戶隔離 |
| `apps/api` | 租戶 API（NestJS + Fastify）：租戶識別、session、權限管線、稽核、OpenAPI |
| `apps/platform-api` | 平台 API：租戶開通與停用、方案與訂閱、用量計數、公告、平台人員；看不到任何健康資料 |
| `packages/ui` | 設計 token、Mantine 主題與共用元件 |
| `packages/api-client` | 租戶 API 的呼叫函式與型別 |
| `apps/web` | 租戶後台（職護、職醫、人資、租戶管理員） |
| `apps/portal` | 員工端（手機優先，網址 `/me`） |
| `apps/platform-web` | 平台管理後台（Yutis 內部人員） |
| `prototype` | 可操作的純前端雛形（需求規格） |

## 開發

需要 Node.js 22、pnpm 10 與 Docker（本機資料庫）：

```bash
pnpm install
docker compose up -d db
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/yutis
pnpm --filter @yutis/db db:migrate   # 建立資料表
pnpm test        # 規則測試（含與雛形一致性比對）、資料庫租戶隔離測試、API 測試
pnpm typecheck
pnpm build
```

若本機已有 PostgreSQL 佔用 5432，可改用其他埠：先設 `YUTIS_DB_PORT=5433` 再 `docker compose up -d db`，`DATABASE_URL` 也改成 `localhost:5433`。

改了 `packages/db/src/schema` 之後，執行 `pnpm --filter @yutis/db db:generate` 產生新的 migration 並一起提交；CI 會檢查兩者一致。

### 租戶 API

本機以子網域 `{租戶}.localhost` 區分租戶，登入暫時用開發模式（以 Email 或手機號碼當作登入 token，不需密碼；正式環境會拒絕啟動）。

```bash
cp apps/api/.env.example apps/api/.env          # 依本機資料庫的埠調整
pnpm --filter @yutis/api db:seed                # 建立 API 登入角色與虛構的 demo 租戶
pnpm --filter @yutis/api jobs:install           # 建立背景工作佇列（pg-boss）
pnpm --filter @yutis/api dev                    # 建置並啟動，http://demo.localhost:3000/api/tenant
pnpm --filter @yutis/api worker                 # 另一個終端機：背景工作（匯出、每晚保存期限掃描）
```

- API 文件：http://localhost:3000/api/docs（非正式環境才有）。
- 登入：`POST /api/auth/sign-in`，body `{"token": "nurse@demo.test", "as": "staff"}`；員工用 `{"token": "0900000001", "as": "employee"}`。
- API 必須以 `yutis_app` 的成員角色連線；若用資料表擁有者或 superuser，RLS 不會生效，API 會拒絕啟動。
- 每個路由都要用 `@Public()`、`@SignedIn()`、`@StaffOnly({ data, feature })` 或 `@EmployeeOnly()` 宣告權限，沒宣告的一律拒絕。處理函式透過 `@Ctx()` 取得 `ctx.tx`（已在該租戶範圍內的交易），讀取健康資料與任何寫入都要在同一個交易內 `recordAudit`，涉及個別員工時先 `assertSiteAccess`。
- 每個路由要有三種測試：其他租戶拿不到、不對的角色拿不到、有寫稽核（見 `apps/api/test/api.test.ts`）。
- 員工資料（`/api/employees`、`/api/employees/:id`）給職護、職醫與人資：只列負責廠區（或有效的破窗授權）的員工，可依姓名或工號、廠區、部門、狀態搜尋並分頁；單一員工另含遮罩後的身分證字號。每位回傳的員工都記入稽核。
- 健檢、協助紀錄、個案（`/api/exams`、`/api/employees/:id/exams`、`/api/records`、`/api/cases`）只給職護、職醫，而且只限負責廠區（或有效的破窗授權）的員工；每次讀取都記入稽核，人資與租戶管理員一律拿不到。健檢以租戶管理員設定的「健檢匯入對照」匯入，依目前發布的分級標準分級並保留版本。
- 四大計畫（`/api/programs/*`）：人因（NMQ）、異常工作負荷（CBI、工時、十年心血管風險 × 負荷矩陣、醫師面談）、母性健康保護、不法侵害。職護、職醫看負責廠區的全部；職安衛人員只看作業環境評估與檢點表；人資只看工作安排建議（`/api/programs/work-advice`）；部門主管只看通知給自己的（`/api/programs/notices`）。各計畫與年齡關注都會產生異常事件，進入個案管理。
- 員工端（`/api/portal/*`）只回傳登入員工本人的資料：待填問卷與待確認紀錄、填寫與確認、我的健康資料與匯出、告知與同意紀錄。Email 連結（`/api/sign/:token`）一次性、會過期，只能開啟一份紀錄；資料庫只存 token 的雜湊。
- 病史、症狀、協助紀錄內容等 `_enc` 欄位以 `TenantCrypto` 加密（每個租戶各自的金鑰）；身分證字號不存完整號碼，只存每個租戶各自的 HMAC 與遮罩值。本機用 `TENANT_CRYPTO_LOCAL_KEY`，正式環境之後改接 Cloud KMS，未設定時相關功能回 503。
- 附表八（`/api/service-records`）由職護、職醫、職安衛人員填寫，送出後依租戶設定的簽核角色寄出一次性簽核連結（`/api/sign/:token`），全部簽核後完成；整個簽核過程記入稽核。
- 統計報表（`/api/reports`，16 種，與雛形相同）：職護、職醫看負責廠區的完整數字；職安衛人員與人資只看去識別統計，少於 5 人的格子（以及可由總數推算出的格子）不顯示。匯出（`/api/exports`）由背景工作產生 Excel／PDF，附匯出人與時間浮水印，以 5 分鐘、一次性的連結下載，申請與下載都記入稽核。
- 保存期限：健檢匯入時依一般 7 年、特殊 10 年設定 `retain_until`（待法務確認）；背景工作每晚列出已過期的資料（`/api/retention`）供人工確認刪除，系統不會自動刪除。
- 租戶管理（`/api/admin/*`，只有租戶管理員）：組織架構、後台人員帳號、員工匯入。Excel 匯入以 .xlsx 檔案本身當 request body（`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`），預設只預覽並列出錯誤列，加 `?commit=true` 才寫入；有任何錯誤列就整份不寫入。欄位格式見 API 文件。
- 改了路由或 DTO 後執行 `pnpm build && pnpm --filter @yutis/api openapi` 更新 `apps/api/openapi.json`，再執行 `pnpm --filter @yutis/api-client generate` 更新前端型別，全部一起提交；CI 會檢查三者一致。

### 平台 API

平台管理後台（`admin.care.yutis.com.tw`）的 API，以 `yutis_platform` 資料庫角色連線：只能用租戶、方案、訂閱、用量計數與平台自己的資料表，對員工、健檢與四大計畫的資料表沒有任何權限（`packages/db` 有測試鎖住）。

```bash
cp apps/platform-api/.env.example apps/platform-api/.env   # 依本機資料庫的埠調整
pnpm --filter @yutis/platform-api db:seed                  # 建立平台登入角色、示範平台人員、方案與預設範本
pnpm --filter @yutis/platform-api dev                      # http://localhost:3001/platform-api/docs
```

- 正式環境由 Identity-Aware Proxy 擋在前面，API 驗證 IAP 簽發的 JWT（`x-goog-iap-jwt-assertion`）再對應 `platform_users` 的角色（營運、客服、工程）。本機用 `X-Dev-Platform-User: ops@yutis.test` 代替，正式環境會拒絕啟動。
- 每個寫入都必須在同一個交易寫 `platform_audit_log`，沒寫的請求會整筆回滾。
- 開通租戶時，Cloud KMS 金鑰、Identity Platform 租戶與邀請信都透過介面呼叫，目前只有本機假實作（`PLATFORM_FAKE_INTEGRATIONS=true`）；任一步失敗會清掉已建立的部分。
- 預設範本（分級規則 V1、片語庫、簽核角色、問卷版本）在 `apps/platform-api/src/templates/defaults.ts`，以 `POST /platform-api/templates/sync` 發布到資料庫。
- 改了路由或 DTO 後執行 `pnpm build && pnpm --filter @yutis/platform-api openapi` 更新 `apps/platform-api/openapi.json`，再執行 `pnpm --filter @yutis/api-client generate`。

### 前端

三個前端都直接呼叫上面兩個 API，沒有內建的示範資料，所以先照上面的步驟啟動 API（`db:seed-demo` 會讓畫面有內容）。畫面設計見 [UX 規格](https://claude.ai/artifact/8qGyJ8B3UVjkPAKZki4n34)。

```bash
pnpm dev:web        # 租戶後台 http://demo.localhost:5180
pnpm dev:portal     # 員工端 http://demo.localhost:5181/me/
pnpm dev:platform   # 平台後台 http://localhost:5182
```

- 一定要用 `demo.localhost` 開租戶後台與員工端：Vite 把 `/api` 轉給 API 時保留 Host，API 由此找到租戶。
- 登入頁依 `GET /api/tenant` 的登入方式顯示。本機與示範站是 `dev`：demo 租戶的登入頁有示範帳號（職護、職醫、職安衛、人資、主管、租戶管理員；員工端有示範員工），一鍵登入，取代以前的角色切換。正式站是 Identity Platform：SSO、Email 登入連結或密碼，取得 ID token 後換成 session cookie（`packages/sign-in`）。
- 選單依 `GET /api/me` 的 `features` 與 `dataCategories` 顯示，只是方便；權限一律由 API 檢查。
- 平台後台的 Vite 代理會替你加上 `X-Dev-Platform-User: ops@yutis.test`；正式環境由 IAP 提供身分，沒有登入頁。
- API 型別在 `packages/api-client/src/generated`，由兩份 `openapi.json` 產生，不要手改。

---

# 雛形

純前端，不需要後端或建置步驟。**所有人員、公司、地址與健康數據都是虛構的示範資料。**

## 在本機執行雛形

需要 Node.js（不需安裝任何套件）：

```bash
pnpm prototype   # 或 node prototype/scripts/serve.js
```

開啟 <http://localhost:5178>。

`index.html` 沒有 `<html>`／`<head>`／`<body>` 標籤，因為原本是發布在會自動補上外框的頁面上；`prototype/scripts/serve.js` 會在本機補上同樣的外框。

## 功能

| 區塊 | 內容 |
|---|---|
| 職護首頁 | 待辦統計、行事曆、異常追蹤（面談通知、指派、主責人員篩選）、待追蹤事項、未完成暫存工作 |
| 員工資料／個人首頁 | 員工主檔、健檢報告分級、協助紀錄（片語、追蹤／結案、暫存）、各計畫結果 |
| 個案管理 | 依異常類型複選取交集；事件狀態 未開單 → 起單 → 處理中 → 結案 |
| 人因性危害 | 肌肉骨骼症狀調查（NMQ）發送、催填、代填；任一部位 ≥3 分判定疑似有危害並列管 |
| 異常工作負荷 | 十年心血管風險 × 工作負荷的風險矩陣、過勞量表、過負荷評估、醫師面談與健康指導 |
| 母性健康保護 | 環境危害辨識與分級、妊娠／產後通報、個人評估、面談紀錄與員工 Email 確認 |
| 不法侵害預防 | 辨識及評估危害、作業場所與人力檢點表、事件通報與處理、措施查核及評估 |
| 勞工健康服務（附表八） | 執行紀錄表、複製、片語、Email 簽核與確認紀錄 |
| 統計分析報表 | 健康管理、異常工作負荷、人因性危害共 16 種報表 |
| 設定 | 醫護人員管理、分級標準（可編輯並即時重算）、片語庫、組織代碼 |
| 員工端預覽 | NMQ 問卷（中文、English、日本語、Tiếng Việt、ภาษาไทย）、過勞量表、母性面談紀錄確認 |

## 檔案（都在 `prototype/`）

| 檔案 | 說明 |
|---|---|
| `index.html` | 頁面外殼與選單 |
| `styles.css` | 樣式（含深色模式與手機版面） |
| `data.js` | 常數與示範資料 |
| `logic.js` | 健檢分級、NMQ、異常工作負荷風險、事件與個案規則 |
| `app.js` | 共用元件、職護首頁、員工資料、個人首頁、協助紀錄 |
| `programs.js` | 人因、異常工作負荷、母性、不法侵害、附表八 |
| `more.js` | 個案管理、報表、設定、員工端預覽 |
| `scripts/serve.js` | 本機預覽伺服器 |

## 資料儲存

資料存在瀏覽器的 `localStorage`，只在你自己的瀏覽器有效。左側選單底部的「重置示範資料」可回到初始狀態。

## 雛形限制

- 不會真的寄 Email、列印或匯入檔案；這些按鈕只顯示提示或模擬結果。匯出以 CSV 文字呈現，可複製貼到 Excel。
- 十年心血管風險以簡化的 Framingham 點數法示意，正式版需依「異常工作負荷促發疾病預防指引」附表校正。
- 健檢分級標準中，部分數值為雛形示範值（分級標準頁面標示「示意」）。
- 年齡關注門檻設為未滿 18 歲或 55 歲以上，可在 `prototype/logic.js` 的 `SENIOR_AGE` 調整。
