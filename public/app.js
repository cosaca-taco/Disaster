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

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const reportsCollection = collection(db, "reports");

let map;
let markers = [];

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
    marker.bindPopup(`<strong>${escapeHtml(report.damageInfo)}</strong><br>
                報告時刻: ${escapeHtml(report.reportedAt)}<br>
                対応状況: ${escapeHtml(report.status)}<br>
                <img src="${report.imageUrl}" style="max-width:160px;">`);
    markers.push(marker);
  });
}

function renderTable(reports) {
  const tbody = document.querySelector("#report-table tbody");
  tbody.innerHTML = "";
  reports.forEach((report) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><a href="${report.imageUrl}" target="_blank"><img src="${report.imageUrl}" alt="報告画像"></a></td>
      <td>${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}</td>
      <td>${escapeHtml(report.reportedAt)}</td>
      <td>${escapeHtml(report.damageInfo)}</td>
      <td></td>
      <td><button class="delete-btn">削除</button></td>
    `;
    const statusCell = tr.children[4];
    const select = document.createElement("select");
    select.className = "status-select";
    STATUSES.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      if (status === report.status) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", () => updateStatus(report.id, select.value));
    statusCell.appendChild(select);

    tr.querySelector(".delete-btn").addEventListener("click", () => deleteReport(report));
    tbody.appendChild(tr);
  });
}

function subscribeReports() {
  const reportsQuery = query(reportsCollection, orderBy("createdAt", "desc"));
  onSnapshot(reportsQuery, (snapshot) => {
    const reports = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTable(reports);
    renderMarkers(reports);
  });
}

async function updateStatus(id, status) {
  await updateDoc(doc(db, "reports", id), { status });
}

async function deleteReport(report) {
  if (!confirm("この報告を削除しますか？")) return;
  await deleteDoc(doc(db, "reports", report.id));
  if (report.imagePath) {
    await deleteObject(ref(storage, report.imagePath)).catch(() => {});
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
  if (gps) {
    status.textContent = `位置情報を検出しました（緯度: ${gps.latitude.toFixed(5)}, 経度: ${gps.longitude.toFixed(5)}）`;
    status.dataset.lat = gps.latitude;
    status.dataset.lng = gps.longitude;
    manualCoords.classList.add("hidden");
  } else {
    status.textContent = "この画像から位置情報を取得できませんでした。緯度・経度を入力してください。";
    delete status.dataset.lat;
    delete status.dataset.lng;
    manualCoords.classList.remove("hidden");
  }
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
  message.textContent = "アップロード中...";

  try {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const imagePath = `reports/${crypto.randomUUID()}.${ext}`;
    const storageRef = ref(storage, imagePath);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const imageUrl = await getDownloadURL(storageRef);

    await addDoc(reportsCollection, {
      latitude,
      longitude,
      imageUrl,
      imagePath,
      reportedAt: document.getElementById("reported-at-input").value,
      damageInfo: document.getElementById("damage-info-input").value,
      status: document.getElementById("status-input").value,
      createdAt: serverTimestamp(),
    });

    message.textContent = "報告を登録しました";
    form.reset();
    setDefaultReportedAt();
    status.textContent = "";
    delete status.dataset.lat;
    delete status.dataset.lng;
    document.getElementById("manual-coords").classList.add("hidden");
  } catch (err) {
    console.error(err);
    message.textContent = "登録に失敗しました。設定（Firebase/権限）を確認してください。";
  } finally {
    submitButton.disabled = false;
  }
}

function init() {
  setDefaultReportedAt();
  document.getElementById("report-form").addEventListener("submit", handleSubmit);
  document.getElementById("image-input").addEventListener("change", handleImageChange);
  initMap();
  subscribeReports();
}

init();
