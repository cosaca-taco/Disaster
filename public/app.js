import { firebaseConfig, siteConfig } from "./config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import exifr from "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs";

const STATUSES = ["未対応", "対応中", "対応済み"];

let pickerMap = null;
let pickerMarker = null;

let lightboxImages = [];
let lightboxIndex = 0;

function openLightbox(images, index = 0) {
  lightboxImages = images;
  lightboxIndex = index;
  updateLightbox();
  document.getElementById("lightbox").classList.remove("hidden");
}

function closeLightbox() {
  document.getElementById("lightbox").classList.add("hidden");
}

function updateLightbox() {
  document.getElementById("lightbox-img").src = lightboxImages[lightboxIndex];
  const counter = document.getElementById("lightbox-counter");
  const multi = lightboxImages.length > 1;
  counter.textContent = multi ? `${lightboxIndex + 1} / ${lightboxImages.length}` : "";
  document.querySelector(".lightbox-prev").style.visibility = multi ? "visible" : "hidden";
  document.querySelector(".lightbox-next").style.visibility = multi ? "visible" : "hidden";
}

function lightboxPrev() {
  lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
  updateLightbox();
}

function lightboxNext() {
  lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
  updateLightbox();
}

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const auth = getAuth(firebaseApp);
const functions = getFunctions(firebaseApp, "asia-northeast1");
const reportsCollection = collection(db, "reports");

let currentUser = null;

// タイトルをsiteConfigから設定
const fullTitle = `Disaster Location Report -${siteConfig.orgName}-`;
document.title = fullTitle;
document.getElementById("site-title").textContent = fullTitle;
document.getElementById("auth-subtitle").textContent = `-${siteConfig.orgName}-`;

let map;
let markers = [];
let markersById = new Map();
let allReports = [];
let activeReportId = null;

function initMap() {
  const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });
  const esriLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
      maxZoom: 19,
    }
  );

  map = L.map("map", { layers: [osmLayer] }).setView(siteConfig.mapCenter, siteConfig.mapZoom);

  L.control.layers(
    { "地図": osmLayer, "航空写真": esriLayer },
    {},
    { position: "topright" }
  ).addTo(map);
}

function clearMarkers() {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
  markersById = new Map();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function renderMarkers(reports) {
  if (!map) return;
  clearMarkers();
  reports.forEach((report) => {
    const marker = L.marker([report.latitude, report.longitude]).addTo(map);
    const popupContent = document.createElement("div");
    popupContent.className = "marker-popup";
    popupContent.innerHTML = `
      <strong>${escapeHtml(report.damageInfo)}</strong><br>
      報告時刻: ${escapeHtml(report.reportedAt)}<br>
      対応状況: ${escapeHtml(report.status)}<br>
      <img src="${report.imageUrl}" alt="報告画像"><br>
      <button type="button" class="popup-detail-btn detail-btn">More</button>
    `;
    popupContent.querySelector(".popup-detail-btn").addEventListener("click", () => openDetail(report.id));
    marker.bindPopup(popupContent);
    markers.push(marker);
    markersById.set(report.id, marker);
  });
}

function focusOnReport(id) {
  const marker = markersById.get(id);
  if (!map || !marker) return;
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14), { animate: true });
  marker.openPopup();
}

function getActiveFilters() {
  return Array.from(document.querySelectorAll(".status-filter"))
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);
}

function applyFiltersAndRender() {
  const filters = getActiveFilters();
  const filtered = allReports.filter((report) => filters.includes(report.status));
  renderTable(filtered);
  renderMarkers(filtered);
}

function renderTable(reports) {
  const tbody = document.querySelector("#report-table tbody");
  tbody.innerHTML = "";
  reports.forEach((report) => {
    const no = allReports.length - allReports.indexOf(report);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><button type="button" class="report-no-btn" title="地図上の位置を表示">${no}</button></td>
      <td>${escapeHtml(report.reportedAt)}</td>
      <td><img src="${report.imageUrl}" alt="報告画像"></td>
      <td><button type="button" class="detail-btn">More</button></td>
    `;
    tr.querySelector(".report-no-btn").addEventListener("click", () => focusOnReport(report.id));
    tr.querySelector(".detail-btn").addEventListener("click", () => openDetail(report.id));
    tbody.appendChild(tr);
  });
}

function subscribeReports() {
  const reportsQuery = query(reportsCollection, orderBy("reportedAt", "desc"));
  onSnapshot(reportsQuery, (snapshot) => {
    allReports = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    applyFiltersAndRender();
    if (activeReportId) {
      const updated = allReports.find((r) => r.id === activeReportId);
      if (updated) renderDetail(updated);
    }
  });
}

function toggleListPanel() {
  const body = document.getElementById("list-body");
  const button = document.getElementById("toggle-list");
  const collapsed = body.classList.toggle("collapsed");
  document.querySelector("main").classList.toggle("list-collapsed", collapsed);
  document.querySelector(".list-panel").classList.toggle("collapsed", collapsed);
  button.textContent = collapsed ? "▶" : "◀";
  button.title = collapsed ? "一覧を開く" : "一覧を折りたたむ";
  button.setAttribute("aria-expanded", String(!collapsed));
  if (map) {
    setTimeout(() => map.invalidateSize(), 220);
  }
}

function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  const anyOpen = Array.from(document.querySelectorAll(".modal-overlay")).some(
    (overlay) => !overlay.classList.contains("hidden")
  );
  if (!anyOpen) document.body.classList.remove("modal-open");
}

function formatHistoryTime(value) {
  if (!value) return "";
  let date = null;
  if (typeof value === "string") {
    date = new Date(value);
  } else if (value.toDate) {
    date = value.toDate();
  }
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function renderDetail(report) {
  // 全画像リスト（ライトボックス用）: 元画像 + 履歴画像の順
  const allImages = [];
  if (report.imageUrl) allImages.push(report.imageUrl);
  if (Array.isArray(report.statusHistory)) {
    report.statusHistory.forEach((entry) => { if (entry.imageUrl) allImages.push(entry.imageUrl); });
  }

  const content = document.getElementById("detail-content");
  content.innerHTML = `
    <dl>
      <dt>報告時刻</dt><dd>${escapeHtml(report.reportedAt)}</dd>
      <dt>報告者</dt><dd>${escapeHtml(report.reporterEmail || "不明")}</dd>
      <dt>位置</dt><dd>${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}</dd>
      <dt>被害情報</dt><dd>${escapeHtml(report.damageInfo)}</dd>
      <dt>現在の対応状況</dt><dd>${escapeHtml(report.status)}</dd>
      <dt>画像</dt><dd>
        <img src="${escapeHtml(report.imageUrl)}" alt="報告画像" class="thumb-img" data-img-index="0">
      </dd>
    </dl>
  `;
  content.dataset.allImages = JSON.stringify(allImages);

  document.getElementById("status-update-select").value = report.status;
  document.getElementById("status-update-message").textContent = "";

  const historyList = document.getElementById("status-history-list");
  historyList.innerHTML = "";
  const history = Array.isArray(report.statusHistory) ? [...report.statusHistory].reverse() : [];
  if (history.length === 0) {
    historyList.innerHTML = '<li class="history-meta">対応履歴はまだありません</li>';
  } else {
    history.forEach((entry, reversedIdx) => {
      const totalEntries = report.statusHistory.length;
      const originalIndex = totalEntries - 1 - reversedIdx;
      const imgIndex = entry.imageUrl ? allImages.indexOf(entry.imageUrl) : -1;
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="history-entry-header">
          <strong>${escapeHtml(entry.status)}</strong>
          <div class="history-actions">
            <button type="button" class="history-edit-btn" data-index="${originalIndex}">編集</button>
            <button type="button" class="history-delete-btn" data-index="${originalIndex}">削除</button>
          </div>
        </div>
        ${entry.note ? `<div class="history-note">${escapeHtml(entry.note)}</div>` : ""}
        ${entry.imageUrl ? `<img src="${escapeHtml(entry.imageUrl)}" alt="対応画像" class="thumb-img history-thumb" data-img-index="${imgIndex}">` : ""}
        <div class="history-meta">${escapeHtml(formatHistoryTime(entry.updatedAt))}</div>
      `;
      historyList.appendChild(li);
    });
  }
}

function openDetail(id) {
  const report = allReports.find((r) => r.id === id);
  if (!report) return;
  activeReportId = id;
  renderDetail(report);
  openModal("detail-modal");
}

async function handleDeleteReport() {
  if (!activeReportId) return;
  const report = allReports.find((r) => r.id === activeReportId);
  if (!report) return;
  if (!confirm("この報告を削除しますか？")) return;

  await deleteDoc(doc(db, "reports", report.id));
  if (report.imagePath) {
    await deleteObject(ref(storage, report.imagePath)).catch(() => {});
  }
  if (Array.isArray(report.statusHistory)) {
    for (const entry of report.statusHistory) {
      if (entry.imagePath) await deleteObject(ref(storage, entry.imagePath)).catch(() => {});
    }
  }
  activeReportId = null;
  closeModal("detail-modal");
}

async function handleDeleteHistoryEntry(originalIndex) {
  if (!activeReportId) return;
  const report = allReports.find((r) => r.id === activeReportId);
  if (!report || !Array.isArray(report.statusHistory)) return;
  if (!confirm("この対応履歴を削除しますか？")) return;

  const entry = report.statusHistory[originalIndex];
  const newHistory = report.statusHistory.filter((_, i) => i !== originalIndex);
  await updateDoc(doc(db, "reports", activeReportId), { statusHistory: newHistory });
  if (entry && entry.imagePath) {
    await deleteObject(ref(storage, entry.imagePath)).catch(() => {});
  }
}

function showHistoryEditForm(li, entry, originalIndex) {
  li.dataset.editIndex = originalIndex;
  li.innerHTML = `
    <form class="history-edit-form">
      <label class="history-edit-label">対応状況
        <select class="history-edit-status">
          ${["未対応", "対応中", "対応済み"].map((s) =>
            `<option value="${s}"${entry.status === s ? " selected" : ""}>${s}</option>`
          ).join("")}
        </select>
      </label>
      <label class="history-edit-label">メモ
        <textarea class="history-edit-note" rows="2">${escapeHtml(entry.note || "")}</textarea>
      </label>
      ${entry.imageUrl ? `
        <div class="history-edit-current">
          <img src="${escapeHtml(entry.imageUrl)}" alt="" class="history-thumb">
          <label class="history-edit-label history-remove-label">
            <input type="checkbox" class="history-remove-img"> 画像を削除する
          </label>
        </div>
      ` : ""}
      <label class="history-edit-label">新しい画像（任意）
        <input type="file" class="history-edit-image" accept="image/*">
      </label>
      <div class="history-edit-btns">
        <button type="submit" class="secondary-btn">保存</button>
        <button type="button" class="history-edit-cancel toggle-btn">キャンセル</button>
      </div>
      <p class="history-edit-message hint"></p>
    </form>
  `;
}

async function handleHistoryEditSubmit(form, originalIndex) {
  if (!activeReportId) return;
  const report = allReports.find((r) => r.id === activeReportId);
  if (!report || !Array.isArray(report.statusHistory)) return;

  const entry = report.statusHistory[originalIndex];
  const newStatus = form.querySelector(".history-edit-status").value;
  const newNote = form.querySelector(".history-edit-note").value.trim();
  const removeImg = form.querySelector(".history-remove-img")?.checked || false;
  const imageFile = form.querySelector(".history-edit-image").files[0];
  const message = form.querySelector(".history-edit-message");
  const submitBtn = form.querySelector("button[type=submit]");

  submitBtn.disabled = true;
  message.textContent = imageFile ? "画像をアップロード中..." : "";

  let imageUrl = entry.imageUrl || null;
  let imagePath = entry.imagePath || null;

  if (removeImg || imageFile) {
    if (entry.imagePath) await deleteObject(ref(storage, entry.imagePath)).catch(() => {});
    imageUrl = null;
    imagePath = null;
  }

  if (imageFile) {
    try {
      const uploadFile = await compressImage(imageFile);
      const ext = (uploadFile.name.split(".").pop() || "jpg").toLowerCase();
      imagePath = `reports/${crypto.randomUUID()}.${ext}`;
      const storageRef = ref(storage, imagePath);
      await uploadBytes(storageRef, uploadFile, { contentType: uploadFile.type });
      imageUrl = await getDownloadURL(storageRef);
    } catch (err) {
      message.textContent = "画像のアップロードに失敗しました。";
      submitBtn.disabled = false;
      return;
    }
  }

  const newEntry = { status: newStatus, note: newNote, updatedAt: entry.updatedAt };
  if (imageUrl) { newEntry.imageUrl = imageUrl; newEntry.imagePath = imagePath; }

  const newHistory = [...report.statusHistory];
  newHistory[originalIndex] = newEntry;
  await updateDoc(doc(db, "reports", activeReportId), { statusHistory: newHistory });
}

async function handleStatusUpdateSubmit(event) {
  event.preventDefault();
  if (!activeReportId) return;

  const newStatus = document.getElementById("status-update-select").value;
  const note = document.getElementById("status-update-note").value.trim();
  const imageFile = document.getElementById("status-image-input").files[0];
  const submitBtn = document.getElementById("status-update-submit");
  const message = document.getElementById("status-update-message");

  submitBtn.disabled = true;
  message.textContent = imageFile ? "画像をアップロード中..." : "";

  let imageUrl = null;
  let imagePath = null;
  if (imageFile) {
    try {
      const uploadFile = await compressImage(imageFile);
      const ext = (uploadFile.name.split(".").pop() || "jpg").toLowerCase();
      imagePath = `reports/${crypto.randomUUID()}.${ext}`;
      const storageRef = ref(storage, imagePath);
      await uploadBytes(storageRef, uploadFile, { contentType: uploadFile.type });
      imageUrl = await getDownloadURL(storageRef);
    } catch (err) {
      message.textContent = "画像のアップロードに失敗しました。";
      submitBtn.disabled = false;
      return;
    }
  }

  const entry = {
    status: newStatus,
    note,
    updatedAt: new Date().toISOString(),
    ...(imageUrl && { imageUrl, imagePath }),
  };

  await updateDoc(doc(db, "reports", activeReportId), {
    status: newStatus,
    statusHistory: arrayUnion(entry),
  });

  document.getElementById("status-update-note").value = "";
  document.getElementById("status-image-input").value = "";
  message.textContent = "";
  submitBtn.disabled = false;
}

const COMPRESS_MAX_DIMENSION = 1600;
const COMPRESS_QUALITY = 0.8;

async function compressImage(file, maxDimension = COMPRESS_MAX_DIMENSION, quality = COMPRESS_QUALITY) {
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (err) {
    console.error("画像の圧縮に失敗したため、元の画像を使用します", err);
    return file;
  }
}

async function detectGps(file) {
  try {
    const gps = await exifr.gps(file);
    if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number") {
      return { latitude: gps.latitude, longitude: gps.longitude };
    }
  } catch (err) {
    // EXIFが無い、または解析できない画像
  }
  return null;
}

function setDefaultReportedAt() {
  const input = document.getElementById("reported-at-input");
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  input.value = now.toISOString().slice(0, 16);
}

function setCoords(latitude, longitude) {
  const status = document.getElementById("gps-status");
  status.dataset.lat = latitude;
  status.dataset.lng = longitude;
}

function clearCoords() {
  const status = document.getElementById("gps-status");
  delete status.dataset.lat;
  delete status.dataset.lng;
}

async function handleImageChange(event) {
  const file = event.target.files[0];
  const gpsStatus = document.getElementById("gps-status");
  if (!file) {
    gpsStatus.textContent = "";
    return;
  }
  gpsStatus.textContent = "画像のEXIF情報から位置情報を確認しています...";
  const gps = await detectGps(file);
  if (gps) {
    setCoords(gps.latitude, gps.longitude);
    gpsStatus.textContent = `📷 画像から位置情報を取得しました（緯度: ${gps.latitude.toFixed(5)}, 経度: ${gps.longitude.toFixed(5)}）`;
  } else {
    clearCoords();
    gpsStatus.textContent = "⚠️ 画像から位置情報を取得できませんでした。「現在地を取得」ボタンを押してください。";
  }
}

function handleUseCurrentLocation() {
  const locationStatus = document.getElementById("location-status");
  const button = document.getElementById("use-current-location");

  if (!("geolocation" in navigator)) {
    locationStatus.innerHTML = "このブラウザでは現在地の取得に対応していません。";
    return;
  }

  button.disabled = true;
  locationStatus.textContent = "現在地を取得しています...（最大20秒かかる場合があります）";

  const onSuccess = (position) => {
    const { latitude, longitude } = position.coords;
    setCoords(latitude, longitude);
    document.getElementById("gps-status").textContent =
      `📍 現在地を取得しました（緯度: ${latitude.toFixed(5)}, 経度: ${longitude.toFixed(5)}）`;
    locationStatus.textContent = "必要に応じて「座標を修正する」から調整できます";
    button.disabled = false;
  };

  const showFinalError = (err) => {
    button.disabled = false;
    // エラーコードに応じてiOS向けの具体的な案内を表示
    if (err.code === 1) {
      locationStatus.innerHTML =
        "⛔ 位置情報の利用が拒否されています。<br>" +
        "【iPhoneの場合】設定 → プライバシーとセキュリティ → 位置情報サービス → Safari → " +
        "「このAppの使用中」または「常に」を選択してください。";
    } else if (err.code === 3) {
      locationStatus.innerHTML =
        "⏱ 位置情報の取得がタイムアウトしました。<br>" +
        "屋外または窓際に移動してから再度お試しください。";
    } else {
      locationStatus.textContent =
        `現在地を取得できませんでした（エラーコード: ${err.code}）。ページを再読み込みしてお試しください。`;
    }
  };

  // まず高精度（GPS）で試し、失敗したら低精度（Wi-Fi/通信）でリトライ
  navigator.geolocation.getCurrentPosition(
    onSuccess,
    (err) => {
      if (err.code === 1) {
        // 権限拒否はリトライ不要
        showFinalError(err);
        return;
      }
      locationStatus.textContent = "GPS取得中（低精度モードで再試行しています）...";
      navigator.geolocation.getCurrentPosition(onSuccess, showFinalError, {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000,
      });
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function openPicker() {
  const picker = document.getElementById("location-picker");
  picker.classList.remove("hidden");
  document.getElementById("toggle-picker").textContent = "🗺️ 地図を閉じる";

  const status = document.getElementById("gps-status");
  const hasCoords = status.dataset.lat && status.dataset.lng;
  const center = hasCoords
    ? [Number(status.dataset.lat), Number(status.dataset.lng)]
    : siteConfig.pickerDefaultCenter;
  const zoom = hasCoords ? 15 : siteConfig.pickerDefaultZoom;

  // すでに初期化済みなら中心だけ更新
  if (pickerMap) {
    pickerMap.setView(center, zoom);
    pickerMarker.setLatLng(center);
    pickerMap.invalidateSize();
    return;
  }

  pickerMap = L.map("picker-map").setView(center, zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(pickerMap);

  pickerMarker = L.marker(center, { draggable: true }).addTo(pickerMap);

  // 地図タップでマーカーを移動
  pickerMap.on("click", (e) => pickerMarker.setLatLng(e.latlng));
}

function closePicker() {
  document.getElementById("location-picker").classList.add("hidden");
  document.getElementById("toggle-picker").textContent = "🗺️ 地図で位置を修正する";
}

function handleTogglePicker() {
  const picker = document.getElementById("location-picker");
  if (picker.classList.contains("hidden")) {
    openPicker();
    // 地図の描画サイズ確定のため少し待つ
    setTimeout(() => pickerMap && pickerMap.invalidateSize(), 150);
  } else {
    closePicker();
  }
}

function handleApplyPickerCoords() {
  if (!pickerMarker) return;
  const { lat, lng } = pickerMarker.getLatLng();
  setCoords(lat, lng);
  document.getElementById("gps-status").textContent =
    `🗺️ 地図で位置を指定しました（緯度: ${lat.toFixed(5)}, 経度: ${lng.toFixed(5)}）`;
  document.getElementById("location-status").textContent = "";
  closePicker();
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const message = document.getElementById("form-message");
  const submitButton = document.getElementById("submit-button");
  const status = document.getElementById("gps-status");

  const file = document.getElementById("image-input").files[0];
  if (!file) return;

  let latitude = status.dataset.lat ? Number(status.dataset.lat) : null;
  let longitude = status.dataset.lng ? Number(status.dataset.lng) : null;

  if (latitude === null || longitude === null) {
    message.textContent = "⚠️ 位置情報が設定されていません。「現在地を取得」または「座標を修正する」から設定してください。";
    return;
  }

  submitButton.disabled = true;
  message.textContent = "画像を圧縮しています...";

  try {
    const uploadFile = await compressImage(file);
    const ext = (uploadFile.name.split(".").pop() || "jpg").toLowerCase();
    const imagePath = `reports/${crypto.randomUUID()}.${ext}`;
    const storageRef = ref(storage, imagePath);

    message.textContent = "アップロード中...";
    await uploadBytes(storageRef, uploadFile, { contentType: uploadFile.type });
    const imageUrl = await getDownloadURL(storageRef);

    const initialStatus = document.getElementById("status-input").value;

    await addDoc(reportsCollection, {
      latitude,
      longitude,
      imageUrl,
      imagePath,
      reportedAt: document.getElementById("reported-at-input").value,
      damageInfo: document.getElementById("damage-info-input").value,
      status: initialStatus,
      reporterEmail: currentUser ? currentUser.email : "",
      statusHistory: [
        { status: initialStatus, note: "新規登録", updatedAt: new Date().toISOString() },
      ],
      createdAt: serverTimestamp(),
    });

    message.textContent = "報告を登録しました";
    form.reset();
    setDefaultReportedAt();
    status.textContent = "";
    clearCoords();
    closePicker();
    document.getElementById("location-status").textContent = "";
    closeModal("new-report-modal");
  } catch (err) {
    console.error(err);
    message.textContent = "登録に失敗しました。設定（Firebase/権限）を確認してください。";
  } finally {
    submitButton.disabled = false;
  }
}

let reportsUnsubscribe = null;

function initApp() {
  setDefaultReportedAt();
  initMap();
  if (!reportsUnsubscribe) reportsUnsubscribe = subscribeReports();

  document.getElementById("report-form").addEventListener("submit", handleSubmit);
  document.getElementById("image-input").addEventListener("change", handleImageChange);
  document.getElementById("use-current-location").addEventListener("click", handleUseCurrentLocation);
  document.getElementById("toggle-picker").addEventListener("click", handleTogglePicker);
  document.getElementById("apply-picker-coords").addEventListener("click", handleApplyPickerCoords);
  document.getElementById("status-update-form").addEventListener("submit", handleStatusUpdateSubmit);
  document.getElementById("delete-report-btn").addEventListener("click", handleDeleteReport);

  document.getElementById("open-new-report").addEventListener("click", () => openModal("new-report-modal"));
  document.getElementById("toggle-list").addEventListener("click", toggleListPanel);
  document.querySelectorAll(".modal-close").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeModal(overlay.id);
    });
  });
  document.querySelectorAll(".status-filter").forEach((checkbox) => {
    checkbox.addEventListener("change", applyFiltersAndRender);
  });
  document.getElementById("signout-btn").addEventListener("click", handleSignOut);
  document.getElementById("open-alert-modal").addEventListener("click", () => openModal("alert-modal"));
  document.getElementById("alert-form").addEventListener("submit", handleSendAlert);

  // 対応履歴の編集・削除
  document.getElementById("status-history-list").addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".history-delete-btn");
    const editBtn = e.target.closest(".history-edit-btn");
    const cancelBtn = e.target.closest(".history-edit-cancel");
    if (deleteBtn) {
      handleDeleteHistoryEntry(parseInt(deleteBtn.dataset.index));
    } else if (editBtn) {
      const li = editBtn.closest("li");
      const originalIndex = parseInt(editBtn.dataset.index);
      const report = allReports.find((r) => r.id === activeReportId);
      if (report && report.statusHistory[originalIndex]) {
        showHistoryEditForm(li, report.statusHistory[originalIndex], originalIndex);
      }
    } else if (cancelBtn) {
      const report = allReports.find((r) => r.id === activeReportId);
      if (report) renderDetail(report);
    }
  });
  document.getElementById("status-history-list").addEventListener("submit", (e) => {
    const form = e.target.closest(".history-edit-form");
    if (!form) return;
    e.preventDefault();
    const li = form.closest("li");
    handleHistoryEditSubmit(form, parseInt(li.dataset.editIndex));
  });

  // ライトボックス
  document.getElementById("detail-modal").addEventListener("click", (e) => {
    const thumb = e.target.closest(".thumb-img");
    if (!thumb) return;
    const images = JSON.parse(document.getElementById("detail-content").dataset.allImages || "[]");
    const index = parseInt(thumb.dataset.imgIndex, 10);
    if (images.length > 0) openLightbox(images, isNaN(index) ? 0 : index);
  });
  document.getElementById("lightbox").addEventListener("click", (e) => {
    if (e.target === document.getElementById("lightbox")) closeLightbox();
  });
  document.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
  document.querySelector(".lightbox-prev").addEventListener("click", lightboxPrev);
  document.querySelector(".lightbox-next").addEventListener("click", lightboxNext);
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("lightbox").classList.contains("hidden")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") lightboxPrev();
    else if (e.key === "ArrowRight") lightboxNext();
  });
}

// ── 認証 ──────────────────────────────────────────

function showAuthScreen() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("user-info").classList.add("hidden");
}

function hideAuthScreen(user) {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("user-info").classList.remove("hidden");
  document.getElementById("user-email").textContent = user.email;
}

function setAuthMessage(id, text, isError = false) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.style.color = isError ? "#c0392b" : "#2c7fb8";
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setAuthMessage("login-message", authErrorMessage(err.code), true);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const confirm = document.getElementById("register-password-confirm").value;
  if (password !== confirm) {
    setAuthMessage("register-message", "パスワードが一致しません", true);
    return;
  }
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setAuthMessage("register-message", authErrorMessage(err.code), true);
  }
}

async function handleForgotPassword() {
  const email = document.getElementById("login-email").value.trim();
  if (!email) {
    setAuthMessage("login-message", "メールアドレスを入力してからボタンを押してください", true);
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMessage("login-message", "パスワードリセットメールを送信しました");
  } catch (err) {
    setAuthMessage("login-message", authErrorMessage(err.code), true);
  }
}

async function handleSignOut() {
  await signOut(auth);
}

async function handleSendAlert(event) {
  event.preventDefault();
  const textarea = document.getElementById("alert-message");
  const message = textarea.value.trim();
  if (!message) return;

  const btn = document.getElementById("send-alert-btn");
  const msgEl = document.getElementById("alert-form-message");
  btn.disabled = true;
  msgEl.textContent = "送信中...";

  try {
    const sendManualAlert = httpsCallable(functions, "sendManualAlert");
    await sendManualAlert({ message });
    msgEl.textContent = "送信しました";
    textarea.value = "";
    setTimeout(() => {
      closeModal("alert-modal");
      msgEl.textContent = "";
    }, 1000);
  } catch (err) {
    console.error(err);
    msgEl.textContent = "送信に失敗しました。時間をおいて再度お試しください。";
  } finally {
    btn.disabled = false;
  }
}

function authErrorMessage(code) {
  const messages = {
    "auth/invalid-email": "メールアドレスの形式が正しくありません",
    "auth/user-not-found": "このメールアドレスは登録されていません",
    "auth/wrong-password": "パスワードが間違っています",
    "auth/invalid-credential": "メールアドレスまたはパスワードが正しくありません",
    "auth/email-already-in-use": "このメールアドレスはすでに登録されています",
    "auth/weak-password": "パスワードは6文字以上で入力してください",
    "auth/too-many-requests": "ログイン試行が多すぎます。しばらく待ってから再試行してください",
  };
  return messages[code] || "エラーが発生しました。再度お試しください";
}

function initAuth() {
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("register-form").addEventListener("submit", handleRegister);
  document.getElementById("forgot-password-btn").addEventListener("click", handleForgotPassword);

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.getElementById("login-form").classList.toggle("hidden", target !== "login");
      document.getElementById("register-form").classList.toggle("hidden", target !== "register");
    });
  });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      hideAuthScreen(user);
      initApp();
    } else {
      currentUser = null;
      showAuthScreen();
    }
  });
}

initAuth();

init();
