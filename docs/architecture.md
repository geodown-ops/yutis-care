# 架構

完整的技術架構建議（選型理由、權限設計、健康個資與台灣法規、資料模型、分期計畫）在 [Yutis Care 技術架構建議](https://claude.ai/code/artifact/46d71d96-5f23-4a60-a359-8d21c220d04c)。

已定案（2026-10-02）：

- 產品型態：多家客戶使用的 SaaS，從第一天就是多租戶（`tenant_id` + PostgreSQL Row-Level Security，租戶專屬加密金鑰）。
- 部署：雲端，Google Cloud 台灣區域（asia-east1）：Cloud Run、Cloud SQL、Cloud Storage、Cloud KMS。

## 目錄

| 路徑 | 內容 | 狀態 |
|---|---|---|
| `packages/domain` | 健康管理規則（健檢分級、NMQ、異常工作負荷、母性、不法侵害、個案狀態），純函式、前後端共用 | 已完成，含與雛形一致性測試 |
| `packages/db` | PostgreSQL schema（38 張表）、migration、`withTenant` 租戶範圍交易 | 已完成，含租戶隔離整合測試 |
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
- 廠區範圍（職護只能看負責廠區）目前由 API 權限層處理，之後評估是否也下放到 RLS。
