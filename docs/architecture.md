# 架構

完整的技術架構建議（選型理由、權限設計、健康個資與台灣法規、資料模型、分期計畫）在 [Yutis Care 技術架構建議](https://claude.ai/code/artifact/46d71d96-5f23-4a60-a359-8d21c220d04c)。

已定案（2026-10-02）：

- 產品型態：多家客戶使用的 SaaS，從第一天就是多租戶（`tenant_id` + PostgreSQL Row-Level Security，租戶專屬加密金鑰）。
- 部署：雲端，Google Cloud 台灣區域（asia-east1）：Cloud Run、Cloud SQL、Cloud Storage、Cloud KMS。

已定案（2026-10-03），前後端規劃見 [Yutis Care 前後端技術規劃](https://claude.ai/code/artifact/bde8e9aa-a55b-47cd-9915-ee20797d0ff3)：

- 正式網域：`care.yutis.net`。租戶後台 `{租戶}.care.yutis.net`，員工端 `{租戶}.care.yutis.net/me`，平台管理後台 `admin.care.yutis.net`；`admin`、`api`、`www` 不給租戶當子網域；`demo` 是示範站自己的租戶，平台也不會開給客戶（規則在 `@yutis/domain` 的 `isAvailableTenantSubdomain`，表單與平台 API 共用）。
- 計費：要計費，但計費模式暫不開發。先保留資料結構（`plans`、`tenant_subscriptions`、`usage_counters`）與擴充點，目前沒有任何程式依它收費。
- 簡訊：費用由營運商（Yutis）負擔，用平台自己的簡訊帳號；每則簡訊仍按租戶記入 `usage_counters`，供日後成本分析或計費。
- 四大計畫不拆賣：每個租戶都可使用全部功能，沒有「啟用模組」開關，權限只看角色與負責廠區。

## 目錄

| 路徑 | 內容 | 狀態 |
|---|---|---|
| `packages/domain` | 健康管理規則（健檢分級、NMQ、異常工作負荷、母性、不法侵害、個案狀態），純函式、前後端共用 | 已完成，含與雛形一致性測試 |
| `packages/db` | PostgreSQL schema（48 張表）、migration、`withTenant` 租戶範圍交易、`yutis_platform` 平台角色 | 已完成，含租戶隔離與平台角色權限測試 |
| `apps/api` | 租戶 API（NestJS + Fastify） | 租戶識別、session、權限管線、稽核、OpenAPI、`/api/tenant`、`/api/me`；租戶管理（組織、帳號、員工匯入、健檢匯入對照、分級標準版本、片語庫、稽核查詢）；健檢匯入與分級、協助紀錄、個案；四大計畫、員工端、Email 確認連結；附表八與簽核、16 種統計報表、匯出、保存期限 |
| `apps/platform-api` | 平台 API（NestJS + Fastify） | 租戶開通／停用、方案與訂閱（續約新增一期、保留歷史）、用量計數、公告、平台人員、預設範本、平台稽核紀錄；計費只有介面 |
| `packages/ui` | 設計 token、Mantine 主題、側欄外框與狀態元件，三個前端共用 | 已建立 |
| `packages/api-client` | 租戶 API 呼叫函式；目前是 `/api/tenant`、`/api/me` 的暫定型別，之後由 OpenAPI 產生 | 已建立 |
| `apps/web` | 租戶後台（React + Vite + Mantine + TanStack Router／Query），選單依角色顯示 | 骨架完成，示範資料 |
| `apps/portal` | 員工端，`/me`，i18next 五種語言 | 骨架完成，示範資料 |
| `apps/platform-web` | 平台管理後台 | 骨架完成，示範資料 |
| `prototype` | 原本的純前端雛形，作為可操作的需求規格 | 保留 |

## 規則的來源與校正

`packages/domain` 的數值與雛形 `prototype/logic.js` 完全一致，`test/prototype-parity.test.ts` 會直接執行雛形的程式比對結果。
標示 `src: 'demo'` 的分級門檻與簡化版 Framingham 心血管風險只是示意，正式上線前需由職醫依「異常工作負荷促發疾病預防指引」附表校正；校正後請同步更新這裡的測試，並移除一致性測試中對應的比對。

## 資料庫

- 每張租戶資料表都有 `tenant_id`，並以 Row-Level Security 限制只能讀寫目前租戶（`app.tenant_id`，由 `withTenant` 在交易內設定）。沒設定租戶時什麼都讀不到。
- 表與表之間用 `(tenant_id, x_id)` 複合外鍵連結，即使繞過 RLS 也無法讓一筆資料指向別的租戶。
- API 以 `yutis_app` 角色連線；它不是資料表擁有者，所以 RLS 一定生效。它不能新增或修改 `tenants`，對 `audit_log` 只能新增與查詢；`audit_log` 另有 trigger 擋下任何修改、刪除與 TRUNCATE。
- 結尾為 `_enc` 的欄位（病史、症狀、協助紀錄內容、面談紀錄、母性與不法侵害事件細節）存的是應用程式以租戶金鑰加密後的位元組（AES-256-GCM，以租戶 id 為附加資料，換租戶無法解密），資料庫看不到明文。身分證字號不存完整號碼，只存以租戶金鑰計算的 HMAC（用來比對健檢醫院的檔案）與畫面顯示用的遮罩值（前 2 碼與後 3 碼，例如 A1•••••789）。金鑰目前由本機主金鑰衍生，正式環境改由 Cloud KMS 包裝每個租戶的資料金鑰。
- 有法定保存年限的資料表帶 `retain_until`。
- 計費擴充點：`plans` 與 `tenant_subscriptions` 由平台寫入，`yutis_app` 只能讀（訂閱只看得到自己租戶的）；`usage_counters` 以「租戶 × 月份 × 指標」累加，`yutis_app` 可新增與累加自己租戶的，不能刪除。人數上限（`seat_limit`）超過時只提醒、不阻擋。目前的訂閱是已開始的最新一期（`currentSubscriptionFirst()`），所以續約可以在到期前先建好。
- 廠區範圍（職護只能看負責廠區）目前由 API 權限層處理，之後評估是否也下放到 RLS。
- 背景工作（pg-boss，`apps/api` 的 worker 程式）以 `yutis_worker` 角色連線：它是 `yutis_app` 的成員，另外只多了 `worker_tenant_ids()` 可列出租戶 id，每個工作仍以 `withTenant()` 一次處理一個租戶。匯出檔以租戶金鑰加密存在 `exports`，一天後失效；`retention_findings` 只記錄已過保存期限的資料，不刪除。
- 寄信（後台人員邀請、附表八與不法侵害查核的簽核連結、員工確認連結、問卷提醒）在同一個交易寫一列 `notifications`，交易確定後才透過 `Mailer` 寄出，再把該列標成 sent 或 failed（含服務商的錯誤訊息）；請求回滾就不會寄。`EMAIL_PROVIDER=log` 只記 log（本機與示範站，該列維持 queued），`resend` 以 Resend HTTPS API 寄出。信件只寫誰請你做什麼與連結，不含任何健康資料。
- 統計報表給非醫護角色時，少於 5 人的格子不顯示，若某欄只隱藏一格，會再隱藏該欄次小的一格，避免以總數相減推算。
- 四大計畫的可見範圍：職護、職醫看負責廠區的全部；職安衛人員只看作業環境評估與檢點表（母性環境評估、不法侵害風險評估與檢點表）；人資只看面談後的工作安排建議；部門主管只看 `manager_notices` 中通知給自己的建議；不法侵害事件只有職護、職醫可見。
- 平台 API 以 `yutis_platform` 角色連線：可讀寫 `tenants`、`plans`、`tenant_subscriptions` 與平台資料表（`platform_users`、`announcements`、`default_templates`、`platform_audit_log`），只能讀 `usage_counters` 與 `support_access_grants`；員工、健檢、四大計畫等資料表完全沒有權限，用量由 `tenant_counts()` 只回傳計數。開通時複製預設範本與建立第一位租戶管理員，透過 `apply_default_templates()`、`invite_tenant_admin()` 兩個函式，而且只能用在還沒有範本或租戶管理員的租戶。`yutis_app` 讀不到平台資料表，只能透過 `tenant_announcements` view 看到給自己的公告。平台的租戶詳情要顯示租戶管理員名單，透過 `tenant_admins()` 只取得名字、Email、是否啟用與最後登入時間。
- 登入 session 存在 `sessions`（只存 token 的 SHA-256），同樣受 RLS 隔離，所以拿 A 租戶的 cookie 到 B 租戶的子網域查不到。API 在知道租戶之前，用 `tenant_by_slug()` 依子網域查租戶；這個函式只回傳完全相符的一筆，無法列出租戶。
