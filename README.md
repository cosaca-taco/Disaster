# 災害位置情報報告システム

画像をアップロードするとEXIFからGPS座標を自動抽出し、地図上にマーカー表示します。被害情報・対応状況をリアルタイムで記録・共有できるシステムです。サーバー不要で Firebase Hosting にデプロイするだけで動作します。

---

## 機能一覧

| 機能 | 説明 |
|------|------|
| 画像からGPS自動取得 | アップロード時にブラウザ上でEXIF解析（exifr） |
| 現在地取得 | ボタン1つでスマートフォンのGPS位置を取得（iOS対応済み） |
| 地図ピッカー | ピンをドラッグして位置を手動修正 |
| 画像圧縮 | 最長辺1600px・JPEG 80%でブラウザ内圧縮（通信量削減） |
| 地図表示 | OpenStreetMap + Leaflet（APIキー不要・無料） |
| 対応状況管理 | 未対応 / 対応中 / 対応済み の3ステップ管理 |
| 対応履歴 | 更新ごとにメモ・画像付きで履歴を記録 |
| 履歴編集・削除 | 誤った履歴エントリの修正・削除 |
| 絞り込み表示 | 対応状況でリストをフィルタリング |
| 認証 | Firebase Authentication（メール＋パスワード） |
| メール通知 | 新規報告・対応状況更新・管理者からのお知らせを全ユーザーにメール送信 |
| リアルタイム同期 | 複数ユーザーの更新が即座に全員の画面に反映 |
| スマートフォン対応 | モバイルファーストのレスポンシブデザイン |

---

## 技術構成

```
Firebase Hosting  ← 静的ファイル（HTML / CSS / JS）を配信
Firebase Firestore ← 報告データのリアルタイムDB
Firebase Storage  ← 画像ファイルの保存
Firebase Auth     ← ユーザー認証（メール＋パスワード）
Leaflet + OpenStreetMap ← 地図表示
exifr（CDN）      ← 画像EXIFのGPS座標抽出
```

---

## ファイル構成

```
/
├── public/
│   ├── index.html   # UIのHTML構造
│   ├── style.css    # スタイルシート
│   ├── app.js       # アプリケーションロジック
│   └── config.js    # ★ 自治体設定・Firebase設定（ここだけ変更）
├── firestore.rules  # Firestoreセキュリティルール
├── storage.rules    # Storageセキュリティルール
└── firebase.json    # Firebaseプロジェクト設定
```

---

## 別の自治体でセットアップする手順

### ステップ 1：リポジトリをクローン

```bash
git clone https://github.com/cosaca-taco/Disaster.git
cd Disaster
```

### ステップ 2：Firebase プロジェクトを作成

1. [Firebase コンソール](https://console.firebase.google.com/) を開く
2. 「プロジェクトを追加」→ プロジェクト名を入力（例: `disaster-○○city`）
3. 左メニューから以下を順番に有効化：
   - **Authentication** → ログイン方法 → 「メール / パスワード」を有効にする
   - **Firestore Database** → データベースを作成 → 本番環境モード → リージョンは `asia-northeast1`（東京）を推奨
   - **Storage** → 開始する → リージョンは `asia-northeast1`

### ステップ 3：Firebase CLIをセットアップ

```bash
npm install -g firebase-tools
firebase login
firebase use --add
# プロジェクトを選択し、エイリアス名（例: default）を設定
```

または `.firebaserc` を直接編集：

```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

### ステップ 4：`public/config.js` を編集（★ここが核心）

Firebase コンソール →「プロジェクトの設定」→「全般」→「マイアプリ」から設定値を取得して入力します。

```js
// public/config.js

export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxx",
};

export const siteConfig = {
  // 画面に表示する自治体名
  orgName: "○○市",

  // 地図の初期表示位置（市役所付近の緯度・経度を設定）
  mapCenter: [緯度, 経度],
  mapZoom: 12,

  // 位置情報未設定時にピッカーが開く位置（通常は mapCenter と同じでよい）
  pickerDefaultCenter: [緯度, 経度],
  pickerDefaultZoom: 12,
};
```

> **緯度・経度の調べ方**: Google マップで市役所を右クリック → 表示される数値（例: 35.4495, 137.4111）をコピーする

### ステップ 5：セキュリティルールをデプロイ

```bash
firebase deploy --only firestore:rules,storage
```

### ステップ 6：最初のユーザーアカウントを作成

Firebase コンソール → Authentication → Users → 「ユーザーを追加」から担当者のメールアドレスとパスワードを登録します。

> ユーザー登録はコンソールから行ってください。登録画面は公開されていますが、Firestoreルールによりログインしないとデータにアクセスできません。

### ステップ 7：ホスティングにデプロイ

```bash
firebase deploy --only hosting
```

デプロイ完了後に表示される URL（`https://your-project.web.app`）でアクセスできます。

---

## メール通知のセットアップ（任意）

以下のタイミングで、Firebase Authentication に登録された全ユーザーにメール通知を送信できます。

- 新規報告が登録されたとき
- 対応状況が更新されたとき（未対応 → 対応中 など）
- 管理者が画面右上の「📢 お知らせ送信」から任意のメッセージを送信したとき（警報発令時など）

メール送信には [SendGrid](https://sendgrid.com/) を使用します（無料プランで1日100件まで送信可能）。

### 1. Blazeプランへのアップグレード

Cloud Functions の利用には **Blazeプラン（従量課金）** が必要です。Firebase コンソール → 左下「プランをアップグレード」から変更してください。少量の利用であれば月額数百円程度です。

### 2. SendGridのセットアップ

1. [SendGrid](https://sendgrid.com/) でアカウントを作成
2. Settings → API Keys → API キーを作成（Full Access）
3. Settings → Sender Authentication → 送信元メールアドレスを認証（Single Sender Verification）

### 3. シークレットを登録

```bash
cd functions
npm install
firebase functions:secrets:set SENDGRID_API_KEY
firebase functions:secrets:set SENDER_EMAIL
```

`SENDER_EMAIL` には手順2で認証した送信元メールアドレスを入力してください。

### 4. 自治体名・サイトURLを設定

`functions/.env.example` を `functions/.env.<Firebaseプロジェクト ID>` という名前でコピーし、内容を編集します。

```bash
cp functions/.env.example functions/.env.your-project-id
```

```env
SITE_URL=https://your-project.web.app
ORG_NAME=○○市 災害位置情報報告システム
```

### 5. デプロイ

```bash
firebase deploy --only functions
```

### 通知メールの例

```
件名: 【○○市 災害位置情報報告システム】新しい報告が登録されました

新しい被害報告が登録されました。

報告時刻: 2026/06/17 14:32
被害情報: 国道沿いの道路冠水
位置: 35.44950, 137.41110
対応状況: 未対応

詳細はシステムでご確認ください。
https://your-project.web.app
```

---

## ユーザー管理

ユーザーの追加・削除は **Firebase コンソール → Authentication → Users** から行います。

- パスワードリセットはログイン画面の「パスワードを忘れた場合」から利用者自身が実行できます
- 現時点では全ログインユーザーが同じ権限を持ちます（管理者ロールは未実装）

---

## 設定値リファレンス（`siteConfig`）

| キー | 型 | 説明 |
|------|----|------|
| `orgName` | string | 自治体名。タイトルバー・ログイン画面に表示 |
| `mapCenter` | [number, number] | 地図初期表示の中心座標 `[緯度, 経度]` |
| `mapZoom` | number | 地図初期ズームレベル（12〜14が市区町村レベルの目安） |
| `pickerDefaultCenter` | [number, number] | 位置情報未設定時にピッカーが開く座標 |
| `pickerDefaultZoom` | number | ピッカーが開く際のズームレベル |

---

## セキュリティに関する注意

現在のルールは「ログインユーザーは全データを読み書きできる」設定です。

```
firestore.rules  ← ログイン必須・更新は status と statusHistory のみ許可
storage.rules    ← ログイン必須・最大15MB・画像ファイルのみ許可
```

本番運用前に以下を検討してください：

- **投稿者本人のみ削除可能**にするには、Firestoreドキュメントに `createdBy: uid` を保存してルールで照合する
- **管理者ロールの分離**が必要な場合は、Firestore に `/users/{uid}` コレクションを作成して `role` フィールドで制御する

---

## 複数自治体での運用について

### 推奨：Firebase プロジェクトを自治体ごとに分ける

| メリット | デメリット |
|---------|-----------|
| データが完全に分離される | プロジェクト数が増える |
| 障害が他自治体に波及しない | Firebase コンソール管理が分散する |
| 無料枠（Sparkプラン）を各自治体で利用できる | デプロイ作業を自治体ごとに実施する必要がある |

別自治体での導入は `public/config.js` の `firebaseConfig` と `siteConfig` を書き換えてデプロイするだけです（所要時間：30分〜1時間程度）。

---

## ローカル開発

```bash
# エミュレーターで完全オフライン動作（Firestore・Storage・Auth含む）
firebase emulators:start

# Hostingのみプレビュー（Firebaseは本番を使用）
firebase serve
```

エミュレーター使用時は `public/config.js` の `connectEmulators` フラグを有効化する必要があります（現状は未実装）。
