# Yutis Care

職場員工健康照護平台，給職護、職醫管理員工健康與職業衛生四大計畫。正式版為多租戶 SaaS，部署於 Google Cloud 台灣區域，架構見 [docs/architecture.md](docs/architecture.md)。

## 專案結構

| 路徑 | 內容 |
|---|---|
| `packages/domain` | 健康管理規則（TypeScript，前後端共用） |
| `packages/db` | PostgreSQL schema（Drizzle）、migration、租戶隔離 |
| `prototype` | 可操作的純前端雛形（需求規格） |

## 開發

需要 Node.js 22、pnpm 10 與 Docker（本機資料庫）：

```bash
pnpm install
docker compose up -d db
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/yutis
pnpm --filter @yutis/db db:migrate   # 建立資料表
pnpm test        # 規則測試（含與雛形一致性比對）與資料庫租戶隔離測試
pnpm typecheck
pnpm build
```

改了 `packages/db/src/schema` 之後，執行 `pnpm --filter @yutis/db db:generate` 產生新的 migration 並一起提交；CI 會檢查兩者一致。

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
