# 搭咩巴士 🚌

點對點香港巴士 ETA app — 冇廣告，即開即查。覆蓋九巴 (KMB) + 城巴 (CTB)。

## 用法

```bash
npm install
npm run dev      # 開發 → http://localhost:5173
```

出發地㩒 📍 用 GPS，或者打站名（中英都得）；揀埋目的地就即刻列出所有直達路線，按最快到站排序，30 秒自動更新。㩒「☆ 收藏路線」下次一㩒即查。

## 其他指令

```bash
npm run build    # production build (dist/)
npm run data     # 更新路線/車站快照 (public/data/*.json)
npm run smoke    # 測試搜尋邏輯 + 現場 ETA
```

## 架構

- **靜態快照**：路線、車站、路線車站序列喺 build 時抓一次存做 JSON（城巴冇 bulk API，所以要 snapshot）。路線改動先需要 `npm run data`。
- **現場 ETA**：直接由瀏覽器 call 官方 open API（`data.etabus.gov.hk` / `rt.data.gov.hk`），冇 server、冇 key、冇廣告。
- **點對點搜尋**：起點/終點各揾 500 米內嘅站，凡係「先經起點站、後經終點站」嘅路線就係候選，再攞 ETA 排序。

## 部署（GitHub Pages PWA）

Push 上 GitHub 就自動 deploy（`.github/workflows/deploy.yml`）：

1. GitHub 開個新 repo，將成個 project folder push 上去（workflow 假設 app 喺 `app/` 入面）
2. Repo Settings → Pages → Source 揀 **GitHub Actions**
3. 之後每次 push `main` 就自動出新版：`https://<username>.github.io/<repo>/`

iPhone 用法：Safari 開條 link → 分享 → **加至主畫面** → 以後全螢幕開，同 app 一樣，GPS 照用。已配置 PWA：離線都開到（路線資料有 cache），有得 install。

## 將來上 App Store

用 [Capacitor](https://capacitorjs.com) 包一層就得，唔使改 code：`npm i @capacitor/core @capacitor/ios && npx cap init && npx cap add ios`。

## 設計

Pixel HK 風格，兩個 theme（右上角切換，跟系統預設）：

- **日間「紅van牌」**：奶油底 `#FFF6E3`、墨色框 `#2B2118`、小巴牌紅 `#C8102E` / 藍 `#1D4E89`
- **夜間「霓虹」**：深紫底 `#17121F`、霓虹粉 `#FF4FA0` / 青 `#4EE1C7`

字體：中文 [Cubic 11 俐方體11號](https://github.com/ACh-K/Cubic-11)（self-host 喺 `public/fonts/`）、數字 Press Start 2P。所有 token 喺 `src/index.css` 用 CSS variables 定義，`.pcard`（硬框硬影卡片）同 `.pbtn`（㩒得落嘅 pixel 掣）係核心 utility。

## 技術

React 19 + TypeScript + Vite + Tailwind CSS v4。資料來源：香港政府資料一線通。
