# myship Skill

以專用 Chrome 操作 7-ELEVEN 賣貨便一般賣場的專案技能，包含可獨立執行的 Node.js CLI。

## 安裝與使用

需要 Node.js 22 以上與 Google Chrome。將整個 `myship` 資料夾放入目標專案的 `.agents/skills/`，從此資料夾執行：

```sh
npm ci
node scripts/cli.js --help
node scripts/cli.js --json stores preview --file assets/examples/store-draft.json --dry-run
node scripts/cli.js login
```

首次登入可能需要在專用 Chrome 手動完成 Facebook 驗證。無須全域安裝；可選擇 `npm link` 啟用 `myship` 別名。新建表單預設隱藏／下架，寫入需要已授權的具體草稿。

## 結構

- `SKILL.md`：代理使用入口與操作邊界。
- `scripts/`：CLI、瀏覽器工作階段、表單操作、草稿驗證及測試。
- `references/cli.md`：指令、欄位與提交結果的核對方式。
- `references/features.md`：網站功能盤點與已知限制。
- `assets/examples/`：合成測試圖片與 JSON 草稿。
- `package.json`、`package-lock.json`：依賴及可重現安裝。

## 驗證

```sh
npm run check
npm test
```

測試使用隔離假頁面，不登入帳號或寫入網站。啟動 CLI 專用瀏覽器後，可另執行 `node scripts/test-session.js` 驗證本機服務的存取限制。

## 分享與授權

`.local/` 包含登入設定檔及本機服務權杖，`node_modules/` 為本機依賴；兩者均忽略且不納入 npm 打包白名單。不要直接壓縮含本機資料的工作目錄。`MYSHIP_HOME` 可指定其他本機資料位置。

以 Git 當前版本匯出可攜原始碼：

```sh
git archive --format=zip --output=../myship-skill.zip HEAD
```

尚未選定開源授權，也未公開發布。公開前需由維護者決定 LICENSE。Git 歷史保留原始開發紀錄；上述匯出僅包含當前版本檔案，不含歷史。
