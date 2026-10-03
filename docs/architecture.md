# 架構

完整的技術架構建議（選型理由、權限設計、健康個資與台灣法規、資料模型、分期計畫）在 [Yutis Care 技術架構建議](https://claude.ai/code/artifact/46d71d96-5f23-4a60-a359-8d21c220d04c)。

已定案（2026-10-02）：

- 產品型態：多家客戶使用的 SaaS，從第一天就是多租戶（`tenant_id` + PostgreSQL Row-Level Security，租戶專屬加密金鑰）。
- 部署：雲端，Google Cloud 台灣區域（asia-east1）：Cloud Run、Cloud SQL、Cloud Storage、Cloud KMS。

## 目錄

| 路徑 | 內容 | 狀態 |
|---|---|---|
| `packages/domain` | 健康管理規則（健檢分級、NMQ、異常工作負荷、母性、不法侵害、個案狀態），純函式、前後端共用 | 已完成，含與雛形一致性測試 |
| `apps/api` | NestJS API | 下一步 |
| `packages/ui` | 設計 token、Mantine 主題、側欄外框與狀態元件，三個前端共用 | 已建立 |
| `packages/api-client` | 租戶 API 呼叫函式；目前是 `/api/tenant`、`/api/me` 的暫定型別，之後由 OpenAPI 產生 | 已建立 |
| `apps/web` | 租戶後台（React + Vite + Mantine + TanStack Router／Query），選單依角色顯示 | 骨架完成，示範資料 |
| `apps/portal` | 員工端，`/me`，i18next 五種語言 | 骨架完成，示範資料 |
| `apps/platform-web` | 平台管理後台 | 骨架完成，示範資料 |
| `prototype` | 原本的純前端雛形，作為可操作的需求規格 | 保留 |

## 規則的來源與校正

`packages/domain` 的數值與雛形 `prototype/logic.js` 完全一致，`test/prototype-parity.test.ts` 會直接執行雛形的程式比對結果。
標示 `src: 'demo'` 的分級門檻與簡化版 Framingham 心血管風險只是示意，正式上線前需由職醫依「異常工作負荷促發疾病預防指引」附表校正；校正後請同步更新這裡的測試，並移除一致性測試中對應的比對。
