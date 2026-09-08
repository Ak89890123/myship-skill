# myship CLI

賣貨便一般賣場 CLI。已實站驗證搜尋、讀取、表單預覽、圖片處理與儲存下架的單／雙規格商品。完整網站功能尚未涵蓋，盤點見 [功能盤點](features.md)。

```powershell
npm install
npm run install-local
node scripts/cli.js --json doctor --offline
node scripts/cli.js login
node scripts/cli.js --json doctor
node scripts/cli.js --json stores list --search 測試賣場
node scripts/cli.js --json stores get GM1234567890
node scripts/cli.js --json products list GM1234567890
node scripts/cli.js --json page inspect
node scripts/cli.js session stop
```

`login` 開啟並保留專用 Chrome，自動點「Facebook 登入」；僅在 Facebook 顯示「你之前已將賣貨便連結到 Facebook」時按「以目前帳號的身分繼續」。遇到帳密、驗證或不符既有授權畫面，停止並回傳 `login_required`，請在專用視窗手動處理。操作中登入失效也會嘗試此有限快速登入；`doctor` 只診斷。

2026-09-08 數次重啟專用 Chrome 後仍可登入並讀取網站，不代表 FB 長期登入永久有效。兩步快速登入另有模擬邊界檢查，尚未刻意登出來強制重現每種 FB 流程。所有指令使用同一個瀏覽器與分頁，指令結束不關閉它。Cookie 匯出／還原方式已停止使用。

本機服務只監聽 127.0.0.1 隨機連接埠，以隨機權杖驗證並拒絕跨來源要求。一次處理一個指令，不提供任意 JavaScript 執行端點。關閉專用瀏覽器或 `session stop` 可結束服務。

`stores list` 只回傳網站目前一頁，不宣稱列出全部；`--search` 等待查詢導覽後讀取。`products list` 支援單／雙規格，分開輸出主圖 `images` 與規格圖 `specificationImages`。`page inspect` 為目前管理頁文字與提示框的唯讀出口。請勿在此專用分頁手動編輯未儲存內容後執行導覽指令。

資料預設在專案 `.local/`；`MYSHIP_HOME` 可改變位置。不要將日常 Chrome 設定檔用於此工具；不要分享或提交 `.local/`，其中包含登入工作階段。

JSON：成功 `{ "ok": true, "data": ... }`；錯誤 `{ "ok": false, "error": { "code": "...", "message": "..." } }` 且 exit code 非零。`--json` 為單行 JSON。`login` 回傳 `login_required` 或 `authenticated` 後退出 CLI，瀏覽器持續開啟。

驗證：`npm run check`、`node scripts/test.js`、啟動專用瀏覽器後 `node scripts/test-session.js`。最後一項檢查跨指令使用同一個本機服務及拒絕未授權要求，不代表真實網站登入已驗證。

結構見 [專案說明](../README.md)。以下指令均從 Skill 根目錄執行。

## 草稿與表單預覽

```powershell
myship --json stores preview --file assets/examples/store-draft.json --dry-run
myship --json stores preview --file assets/examples/store-draft.json
myship --json products preview GM1234567890 --file assets/examples/product-double.json --dry-run
myship --json products preview GM1234567890 --file assets/examples/product-double.json
```

`--dry-run` 只做本機驗證，不需登入；省略該旗標會填入專用分頁，不儲存、不上傳圖片。其他導覽指令會丟失預覽；錯誤可能留下部分填表內容，但不會自動提交。

賣場草稿：`id`、`name`、`description`、`status` (`on/off`)、`visibility` (`public/hidden`)、`pickupFee`、`images`、`products`。無 `id` 是新表單，預設下架／隱藏；指定 `id` 只填提供的欄位。`pickupFee` 啟用店取及取貨付款，讀取網站即時運費上限；範例 38 元只是測試值，活動改變時須調整。其他物流與完整賣場設定尚未提供填表支援。

商品草稿：`match`、`name`、`description`、`status` (`on/off`)、`condition` (`new/used`)、`minOrder`、`maxOrder`、`specifications`、`doubleSpecifications`、`images`、`specificationImages`。無 `match` 是新增未儲存商品，預設下架；`match: {"id":"商品ID"}` 或 `match: {"name":"商品完整名稱"}` 必須唯一精確匹配，否則停止。

單規格：`"specifications":[{"name":"藍色","stock":1,"price":100,"salePrice":null}]`。既有規格按名稱匹配，新名稱追加，未列出的保留；不提供規格刪除／改名。`salePrice: null` 清空優惠價，省略則保留。

雙規格：[assets/examples/product-double.json](../assets/examples/product-double.json) 有兩個 `axes`，每軸包含 `name`、`options`；`variants` 必須涵蓋完整交叉組合，每組指定 `options`、`stock`、`price` 及可選 `salePrice`。既有雙規格僅支援相同軸名稱與選項的價格／庫存更新，不轉換規格類型。

圖片：`"images":["C:/images/main.png"]`、`"specificationImages":[{"option":"藍色","path":"C:/images/blue.png"}]`。相對圖片路徑以 JSON 所在目錄為準。preview 只驗證本機大小、檔頭及格式並回傳路徑；另用下列 upload 指令逐張處理。商品最多 7 張主圖、賣場最多 3 張，每張 6 MB；規格圖對應單規格名稱或雙規格第一軸選項。

網站要求完成前一商品資料（含圖片）才能新增下一個；多商品草稿可離線驗證，但填表可能停在第一個未完成商品。上述範例分別驗證單、雙規格，未繞過網站限制。

JSON 預覽回傳 `previewId`。讀取商品時價格／庫存為網站字串；草稿輸入必須為整數。

## 圖片與儲存

先取得具體草稿的寫入授權；preview 本身不提交。upload 會將指定本機圖交給網站元件，以預設裁切確認（主圖可能自動完成）。逐張執行，完成後才 commit。

```powershell
myship --json page upload --target store --index 1 --file assets/examples/test-banner.png
myship --json page upload --target product --index 0 --file assets/examples/test-blue.png
myship --json page upload --target spec --index 0 --option 藍色 --file assets/examples/test-blue.png
myship --json page commit --preview-id <preview 回傳的 ID>
```

商品 index 必須使用當次 preview 的 `product.index`，不是商品 ID；賣場圖片 index 為 1–3。商品主圖追加至空白欄位，規格圖只支援空白欄位，不刪除舊圖。upload 可加 `--dry-run` 做本機圖片驗證。

commit 僅提交一次，會確認預覽所在網址、名稱與狀態，並處理已知防詐提示；不接受 `--dry-run`。`submitted` 表示觀察到儲存端點回應，**不等於已成功儲存**。必須以 `stores list/get`、`products list` 讀回核對；逾時或結果不明不得直接重試。導覽或重啟會使預覽失效。

新賣場先提交賣場設定，查出 GM 編號，再逐件 `products preview → upload → commit → products list`。賣場 commit 不代表其 products 草稿一併儲存。

2026-09-08 已實測核准的隱藏下架賣場、單規格 2 張主圖及 2 張規格圖、雙規格 4 個組合與圖片；價格及狀態讀回一致。此實測不涵蓋正式發布、刪除、批次或全部物流設定。

寫入回歸檢查：`node scripts/test-writes.js` 使用隔離瀏覽器與攔截的假頁面，不接觸帳號。`operations.js` 負責讀取、填表、圖片與一次性提交。
