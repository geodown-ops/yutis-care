# 架構

完整的技術架構建議（選型理由、權限設計、健康個資與台灣法規、資料模型、分期計畫）在 [Yutis Care 技術架構建議](https://claude.ai/code/artifact/46d71d96-5f23-4a60-a359-8d21c220d04c)。

已定案（2026-10-02）：

- 產品型態：多家客戶使用的 SaaS，從第一天就是多租戶（`tenant_id` + PostgreSQL Row-Level Security，租戶專屬加密金鑰）。
- 部署：雲端，Google Cloud 台灣區域（asia-east1）：Cloud Run、Cloud SQL、Cloud Storage、Cloud KMS。

已定案（2026-10-03），前後端規劃見 [Yutis Care 前後端技術規劃](https://claude.ai/code/artifact/bde8e9aa-a55b-47cd-9915-ee20797d0ff3)：

- 正式網域：`care.yutis.com.tw`。租戶後台 `{租戶}.care.yutis.com.tw`，員工端 `{租戶}.care.yutis.com.tw/me`，平台管理後台 `admin.care.yutis.com.tw`；`admin`、`api`、`www` 不給租戶當子網域。
- 計費：要計費，但計費模式暫不開發。先保留資料結構（`plans`、`tenant_subscriptions`、`usage_counters`）與擴充點，目前沒有任何程式依它收費。
- 簡訊：費用由營運商（Yutis）負擔，用平台自己的簡訊帳號；每則簡訊仍按租戶記入 `usage_counters`，供日後成本分析或計費。
- 四大計畫不拆賣：每個租戶都可使用全部功能，沒有「啟用模組」開關，權限只看角色與負責廠區。

## 目錄

| 路徑 | 內容 | 狀態 |
|---|---|---|
| `packages/domain` | 健康管理規則（健檢分級、NMQ、異常工作負荷、母性、不法侵害、個案狀態），純函式、前後端共用 | 已完成，含與雛形一致性測試 |
| `packages/db` | PostgreSQL schema（41 張表）、migration、`withTenant` 租戶範圍交易 | 已完成，含租戶隔離整合測試 |
| `apps/api` | NestJS API | 下一步 |
| `apps/web` | React + Vite 後台與員工端 | 下一步 |
| `prototype` | 原本的純前端雛形，作為可操作的需求規格 | 保留 |

## 規則的來源與校正

`packages/domain` 的數值與雛形 `prototype/logic.js` 完全一致，`test/prototype-parity.test.ts` 會直接執行雛形的程式比對結果。
標示 `src: 'demo'` 的分級門檻與簡化版 Framingham 心血管風險只是示意，正式上線前需由職醫依「異常工作負荷促發疾病預防指引」附表校正；校正後請同步更新這裡的測試，並移除一致性測試中對應的比對。

## 資料庫

- 每張租戶資料表都有 `tenant_id`，並以 Row-Level Security 限制只能讀寫目前租戶（`app.tenant_id`，由 `withTenant` 在交易內設定）。沒設定租戶時什麼都讀不到。
- 表與表之間用 `(tenant_id, x_id)` 複合外鍵連結，即使繞過 RLS 也無法讓一筆資料指向別的租戶。
- API 以 `yutis_app` 角色連線；它不是資料表擁有者，所以 RLS 一定生效。它不能新增或修改 `tenants`，對 `audit_log` 只能新增與查詢；`audit_log` 另有 trigger 擋下任何修改、刪除與 TRUNCATE。
- 結尾為 `_enc` 的欄位（病史、症狀、協助紀錄內容、面談紀錄、母性與不法侵害事件細節）存的是應用程式以租戶金鑰加密後的位元組，資料庫看不到明文。
- 有法定保存年限的資料表帶 `retain_until`。
- 計費擴充點：`plans` 與 `tenant_subscriptions` 由平台寫入，`yutis_app` 只能讀（訂閱只看得到自己租戶的）；`usage_counters` 以「租戶 × 月份 × 指標」累加，`yutis_app` 可新增與累加自己租戶的，不能刪除。人數上限（`seat_limit`）超過時只提醒、不阻擋。
- 廠區範圍（職護只能看負責廠區）目前由 API 權限層處理，之後評估是否也下放到 RLS。
