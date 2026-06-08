import { firebaseConfig } from "./config.js";

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
import exifr from "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs";

const STATUSES = ["未対応", "対応中", "対応済み"];
const DEFAULT_FILTERS = ["未対応", "対応中"];

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const reportsCollection = collection(db, "reports");

let map;
let markers = [];
let markersById = new Map();
let allReports = [];
let activeReportId = null;

function initMap() {
  map = L.map("map").setView([35.681236, 139.767125], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
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
      <button type="button" class="popup-detail-btn detail-btn">詳細</button>
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
  reports.forEach((report, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><button type="button" class="report-no-btn" title="地図上の位置を表示">${index + 1}</button></td>
      <td>${escapeHtml(report.reportedAt)}</td>
      <td><img src="${report.imageUrl}" alt="報告画像"></td>
      <td><button type="button" class="detail-btn">詳細</button></td>
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
  button.textContent = collapsed ? "開く" : "折りたたむ";
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
  if (typeof value === "string") return value;
  if (value.toDate) return value.toDate().toLocaleString("ja-JP");
  return "";
}

function renderDetail(report) {
  const content = document.getElementById("detail-content");
  content.innerHTML = `
    <dl>
      <dt>報告時刻</dt><dd>${escapeHtml(report.reportedAt)}</dd>
      <dt>位置</dt><dd>${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}</dd>
      <dt>被害情報</dt><dd>${escapeHtml(report.damageInfo)}</dd>
      <dt>現在の対応状況</dt><dd>${escapeHtml(report.status)}</dd>
      <dt>画像</dt><dd><img src="${report.imageUrl}" alt="報告画像"></dd>
    </dl>
  `;

  document.getElementById("status-update-select").value = report.status;

  const historyList = document.getElementById("status-history-list");
  historyList.innerHTML = "";
  const history = Array.isArray(report.statusHistory) ? [...report.statusHistory].reverse() : [];
  if (history.length === 0) {
    historyList.innerHTML = '<li class="history-meta">対応履歴はまだありません</li>';
  } else {
    history.forEach((entry) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div><strong>${escapeHtml(entry.status)}</strong></div>
        ${entry.note ? `<div>${escapeHtml(entry.note)}</div>` : ""}
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
  activeReportId = null;
  closeModal("detail-modal");
}

async function handleStatusUpdateSubmit(event) {
  event.preventDefault();
  if (!activeReportId) return;

  const newStatus = document.getElementById("status-update-select").value;
  const note = document.getElementById("status-update-note").value.trim();

  await updateDoc(doc(db, "reports", activeReportId), {
    status: newStatus,
    statusHistory: arrayUnion({
      status: newStatus,
      note,
      updatedAt: new Date().toISOString(),
    }),
  });

  document.getElementById("status-update-note").value = "";
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

async function handleImageChange(event) {
  const file = event.target.files[0];
  const status = document.getElementById("gps-status");
  const manualCoords = document.getElementById("manual-coords");
  if (!file) {
    status.textContent = "";
    return;
  }
  status.textContent = "画像のEXIF情報から位置情報を確認しています...";
  const gps = await detectGps(file);
  const useCurrentLocationBtn = document.getElementById("use-current-location");
  if (gps) {
    status.textContent = `位置情報を検出しました（緯度: ${gps.latitude.toFixed(5)}, 経度: ${gps.longitude.toFixed(5)}）`;
    status.dataset.lat = gps.latitude;
    status.dataset.lng = gps.longitude;
    manualCoords.classList.add("hidden");
    useCurrentLocationBtn.classList.add("hidden");
  } else {
    status.textContent = "この画像から位置情報を取得できませんでした。緯度・経度を入力するか、現在地を取得してください。";
    delete status.dataset.lat;
    delete status.dataset.lng;
    manualCoords.classList.remove("hidden");
    useCurrentLocationBtn.classList.remove("hidden");
  }
}

function handleUseCurrentLocation() {
  const locationStatus = document.getElementById("location-status");
  const button = document.getElementById("use-current-location");

  if (!("geolocation" in navigator)) {
    locationStatus.textContent = "このブラウザでは現在地の取得に対応していません。";
    return;
  }

  button.disabled = true;
  locationStatus.textContent = "現在地を取得しています...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      document.getElementById("latitude-input").value = latitude;
      document.getElementById("longitude-input").value = longitude;
      locationStatus.textContent = `現在地を入力しました（緯度: ${latitude.toFixed(5)}, 経度: ${longitude.toFixed(5)}）`;
      button.disabled = false;
    },
    (error) => {
      locationStatus.textContent = "現在地を取得できませんでした。位置情報の利用許可を確認してください。";
      button.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
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
    const manualLat = document.getElementById("latitude-input").value;
    const manualLng = document.getElementById("longitude-input").value;
    if (manualLat === "" || manualLng === "") {
      message.textContent = "位置情報を取得できないため、緯度・経度を入力してください。";
      return;
    }
    latitude = Number(manualLat);
    longitude = Number(manualLng);
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
      statusHistory: [
        { status: initialStatus, note: "新規登録", updatedAt: new Date().toISOString() },
      ],
      createdAt: serverTimestamp(),
    });

    message.textContent = "報告を登録しました";
    form.reset();
    setDefaultReportedAt();
    status.textContent = "";
    delete status.dataset.lat;
    delete status.dataset.lng;
    document.getElementById("manual-coords").classList.add("hidden");
    document.getElementById("use-current-location").classList.add("hidden");
    document.getElementById("location-status").textContent = "";
    closeModal("new-report-modal");
  } catch (err) {
    console.error(err);
    message.textContent = "登録に失敗しました。設定（Firebase/権限）を確認してください。";
  } finally {
    submitButton.disabled = false;
  }
}

function init() {
  setDefaultReportedAt();
  initMap();
  subscribeReports();

  document.getElementById("report-form").addEventListener("submit", handleSubmit);
  document.getElementById("image-input").addEventListener("change", handleImageChange);
  document.getElementById("use-current-location").addEventListener("click", handleUseCurrentLocation);
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
}

init();
