# 災害位置情報報告システム（Firebase版）

画像をアップロードすると、ブラウザ側でEXIFからGPS位置情報を抽出し、地図上に表示します。
あわせて、報告時刻・被害情報・対応状況を Firestore（データベース）と Firebase Storage（画像保存）に記録・更新できます。

サーバーは不要で、Firebase Hosting にデプロイするだけで動作する静的サイト構成です。

## 構成

- **Firestore**: 報告データ（位置情報・報告時刻・被害情報・対応状況など）の保存
- **Firebase Storage**: アップロードされた画像の保存
- **Firebase Hosting**: 静的サイト（HTML/CSS/JS）の公開
- **Leaflet + OpenStreetMap**: 地図表示（APIキー不要・無料）
- **exifr**（CDN経由）: ブラウザ上で画像のEXIFからGPS座標を抽出

## セットアップ

### 1. Firebase プロジェクトを準備

```bash
npm install -g firebase-tools
firebase login
firebase init
```

Firestore, Storage, Hosting を有効にし、`.firebaserc` の `your-firebase-project-id` を実際のプロジェクトIDに置き換えてください。

### 2. 設定値を入力

`public/config.js` を編集し、Firebase コンソールで取得した設定値を設定します。

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

地図表示には Leaflet + OpenStreetMap を使用しているため、APIキーや課金設定は不要です。

### 3. ローカルで動作確認

```bash
firebase emulators:start
```

または

```bash
firebase serve
```

### 4. デプロイ

```bash
firebase deploy
```

## 機能

- 画像選択時にブラウザ上でEXIFのGPS情報を自動抽出（取得できない場合は緯度・経度の手入力や現在地取得が可能）
- アップロード前にブラウザ上で画像を圧縮（最長辺1600px・JPEG品質80%にリサイズ/再エンコード）し、保存容量と通信量を削減
- 地図（OpenStreetMap）上に被害箇所をマーカー表示（クリックで詳細を表示）
- 報告時刻・被害情報・対応状況（未対応／対応中／対応済み）を Firestore に登録
- 一覧画面から対応状況の更新・報告の削除が可能（Firestore はリアルタイム同期）

## セキュリティに関する注意

`firestore.rules` / `storage.rules` は動作確認用の簡易設定です。本番運用する場合は Firebase Authentication 等を導入し、書き込み・削除を許可されたユーザーのみに制限することを推奨します。
