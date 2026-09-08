---
name: myship
description: 使用隨附的 myship CLI 查詢 7-ELEVEN 賣貨便一般賣場與單雙規格，建立 JSON 預覽，並依授權處理圖片與儲存。
---

以本 SKILL.md 所在資料夾為根目錄。首次使用先執行 `npm ci`；需要 Node.js 22 以上與 Google Chrome。用 `node scripts/cli.js --json doctor` 檢查狀態。完整指令與欄位見 [CLI 文件](references/cli.md)，網站盤點見 [功能文件](references/features.md)。下文 `myship` 均可用 `node scripts/cli.js` 代替；不需要全域安裝。

登入不足時執行 `myship login`，沿用專用 Chrome 的完整設定檔及同一個 live browser。它只自動點 Facebook 登入與既有連結的繼續按鈕；帳密或驗證由使用者手動處理。不複製日常 Chrome 登入資料，也不匯出／還原 Cookie。`doctor --offline` 只驗證本機，不代表網站登入成功。

用 `stores list --search` 找 GM 編號（只查目前一頁），再用 `stores get`／`products list` 精確讀取。完整一般賣場網址也可代替 GM 編號。商品讀取回傳 ID、主圖、規格圖、單／雙規格；更新的 `match` 必須是唯一 ID 或完整名稱。

先依 CLI 文件準備 JSON，執行 `stores preview` 或 `products preview` 搭配 `--dry-run`。確認後省略旗標可填表但不儲存；圖片仍只驗證本機檔案。相對圖片路徑以 JSON 所在目錄為準。導覽指令會丟失未儲存預覽。

寫入須有具體草稿與使用者授權，既有授權持續有效。預覽回傳 previewId；用 page upload --target store|product|spec --index N --file 圖片（規格另加 --option）逐張處理，再 page commit --preview-id ID。商品 index 使用當次 preview 回傳值，賣場圖片為 1–3。新賣場先提交設定、查出 GM 編號，再逐件預覽商品、上圖、提交與讀回。不得用現有公開商品的改價或發布來試錯。

commit 的 submitted 不等於儲存成功，必須 stores get／products list 讀回。ID 只能使用一次；導覽、重啟或結果不明時先查網站，勿重試造成重複。已實測核准的隱藏下架賣場與單雙規格圖片儲存；不宣稱全功能、批次或刪除已完成。

唯讀補充出口是 `myship --json page inspect`。沒有任意 JavaScript／HTTP 執行功能。`session stop` 關閉專用 Chrome，平常保留它。

```powershell
node scripts/cli.js --json stores list --search 測試賣場
node scripts/cli.js --json products list GM1234567890
node scripts/cli.js --json stores preview --file assets/examples/store-draft.json --dry-run
```
