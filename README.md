# 災害位置情報報告システム

画像をアップロードすると EXIF から GPS 位置情報を抽出し、Google マップ上に表示します。
あわせて、報告時刻・被害情報・対応状況をデータベース（SQLite）に保存し、一覧で管理できます。

## セットアップ

```bash
pip install -r requirements.txt
export GOOGLE_MAPS_API_KEY="あなたのGoogle Maps APIキー"
uvicorn app.main:app --reload
```

ブラウザで http://localhost:8000 を開きます。

## 機能

- 画像アップロード時に EXIF の GPS 情報を自動抽出（取得できない場合は緯度・経度を手入力可能）
- Google マップ上に被害箇所をマーカー表示（クリックで詳細を表示）
- 報告時刻・被害情報・対応状況（未対応／対応中／対応済み）をデータベースに登録
- 一覧画面から対応状況の更新・報告の削除が可能

## API

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/reports` | 報告一覧取得 |
| POST | `/api/reports` | 報告登録（multipart/form-data: image, reported_at, damage_info, status, [latitude, longitude]） |
| PATCH | `/api/reports/{id}` | 対応状況の更新 |
| DELETE | `/api/reports/{id}` | 報告削除 |
| GET | `/api/config` | フロントエンド設定（Google Maps APIキー）取得 |
