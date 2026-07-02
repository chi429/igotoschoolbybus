# 上架 App Store 指南 🍎

Project 已經 setup 好 Capacitor（`capacitor.config.ts`），淨係差 native 嗰幾步要喺你部 Mac 行。

## 前置（一次過）

1. **Apple Developer Program** — US$99/年，用你公司或個人 Apple ID 喺 [developer.apple.com](https://developer.apple.com) 報名（審批要 1–2 日）
2. **Xcode** — App Store 免費裝，裝埋 iOS Simulator
3. `capacitor.config.ts` 入面個 `appId`（而家係 `digital.skymakers.dapmebus`）想改就趁未 add ios 之前改

## 生成 iOS project（一次過）

```bash
cd app
npm run build        # 要先有 dist/
npm run ios:add      # 生成 ios/ 資料夾
npm run ios:sync     # build + 同步 web code 入 native project
npm run ios:open     # 開 Xcode
```

## Xcode 入面要做嘅嘢（一次過）

1. **Signing** — 揀 App target → Signing & Capabilities → 揀你個 Team，Xcode 會自動搞 certificates
2. **定位權限** — `ios/App/App/Info.plist` 加：
   ```xml
   <key>NSLocationWhenInUseUsageDescription</key>
   <string>用你而家嘅位置揾附近巴士站</string>
   ```
3. **App Icon** — 1024×1024 一張放入 `Assets.xcassets/AppIcon`（pixel 巴士 icon，你出手啦 🎨；記住 icon 唔可以有透明位）
4. **Display name** — 搭咩巴士

## 日常 workflow

改完 web code → `npm run ios:sync` → Xcode ▶️ 揀 simulator 或者插住嘅 iPhone 試。

## 上架流程

1. [App Store Connect](https://appstoreconnect.apple.com) → My Apps → ➕ New App，bundle ID 揀返同 `appId` 一樣嗰個
2. Xcode: Product → Archive → Distribute App → App Store Connect（upload）
3. 上 TestFlight 自己試一輪先（upload 完自動有得用）
4. App Store Connect 填 listing：
   - **Screenshots**：6.7" (iPhone Pro Max) 必須，日夜 mode 各影幾張
   - **Privacy**：Data collection 揀 Location →「App functionality」→ not linked to identity、no tracking（我哋冇 server，冇收集任何嘢，好填）
   - **Privacy policy URL**：要一條 link，一頁靜態頁寫「唔收集任何個人資料，定位只喺裝置上用」就夠
   - 註明資料來源：香港政府資料一線通 (data.gov.hk)
5. Submit for review — 通常 1–2 日

## Review 提示

- **Guideline 4.2**（唔可以係純網頁 wrapper）— 我哋有 native 定位、離線路線資料、收藏，功能實在，一般冇問題。如果被問，喺 review notes 講明用 device GPS + 政府 open data 提供即時到站
- App 名「搭咩巴士」如果撞名，subtitle 可以用「香港巴士點對點 ETA」

## Android（第日想上 Play Store）

一樣做法：`npm i @capacitor/android && npx cap add android`，Google Play 一次性 US$25。
