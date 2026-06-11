// Firebase コンソール > プロジェクトの設定 > 全般 > マイアプリ から取得した設定値に置き換えてください
export const firebaseConfig = {
  apiKey: "AIzaSyCCgBYccUTkr2W0A3b0CmXisRwIrZGQZIA",
  authDomain: "disaster-taco.firebaseapp.com",
  projectId: "disaster-taco",
  storageBucket: "disaster-taco.firebasestorage.app",
  messagingSenderId: "849447593651",
  appId: "1:849447593651:web:c6fabd729cc8b0864eb2c6",
};

// ── 自治体設定 ──────────────────────────────────────
// 別の自治体で利用する場合はここだけ変更してください
export const siteConfig = {
  // 画面に表示する自治体名（タイトルバー・ログイン画面に使用）
  orgName: "ENA City",

  // 地図の初期表示位置（緯度・経度）と初期ズームレベル
  mapCenter: [35.4495, 137.4111],  // 恵那市役所付近
  mapZoom: 12,

  // 位置情報が未設定の場合にピッカーが開く場所（通常は mapCenter と同じでよい）
  pickerDefaultCenter: [35.4495, 137.4111],
  pickerDefaultZoom: 12,
};
