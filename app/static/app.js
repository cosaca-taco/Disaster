let map;
let markers = [];

async function initMap() {
  const { Map } = await google.maps.importLibrary("maps");
  map = new Map(document.getElementById("map"), {
    center: { lat: 35.681236, lng: 139.767125 },
    zoom: 6,
  });
}

function loadGoogleMaps(apiKey) {
  if (!apiKey) {
    document.getElementById("map").textContent =
      "Google Maps APIキーが設定されていません（環境変数 GOOGLE_MAPS_API_KEY を設定してください）";
    return;
  }
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=initMap`;
  script.async = true;
  document.head.appendChild(script);
}
window.initMap = initMap;

function clearMarkers() {
  markers.forEach((m) => m.setMap(null));
  markers = [];
}

function renderMarkers(reports) {
  if (!map) return;
  clearMarkers();
  reports.forEach((report) => {
    const marker = new google.maps.Marker({
      position: { lat: report.latitude, lng: report.longitude },
      map,
      title: report.damage_info,
    });
    const info = new google.maps.InfoWindow({
      content: `<strong>${escapeHtml(report.damage_info)}</strong><br>
                報告時刻: ${escapeHtml(report.reported_at)}<br>
                対応状況: ${escapeHtml(report.status)}<br>
                <img src="${report.image_path}" style="max-width:160px;">`,
    });
    marker.addListener("click", () => info.open(map, marker));
    markers.push(marker);
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function renderTable(reports) {
  const tbody = document.querySelector("#report-table tbody");
  tbody.innerHTML = "";
  reports.forEach((report) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${report.id}</td>
      <td><a href="${report.image_path}" target="_blank"><img src="${report.image_path}" alt="報告画像"></a></td>
      <td>${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}</td>
      <td>${escapeHtml(report.reported_at)}</td>
      <td>${escapeHtml(report.damage_info)}</td>
      <td></td>
      <td><button class="delete-btn" data-id="${report.id}">削除</button></td>
    `;
    const statusCell = tr.children[5];
    const select = document.createElement("select");
    select.className = "status-select";
    ["未対応", "対応中", "対応済み"].forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      if (status === report.status) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", () => updateStatus(report.id, select.value));
    statusCell.appendChild(select);

    tr.querySelector(".delete-btn").addEventListener("click", () => deleteReport(report.id));
    tbody.appendChild(tr);
  });
}

async function fetchReports() {
  const res = await fetch("/api/reports");
  const reports = await res.json();
  renderTable(reports);
  renderMarkers(reports);
}

async function updateStatus(id, status) {
  const formData = new FormData();
  formData.append("status", status);
  await fetch(`/api/reports/${id}`, { method: "PATCH", body: formData });
  await fetchReports();
}

async function deleteReport(id) {
  if (!confirm("この報告を削除しますか？")) return;
  await fetch(`/api/reports/${id}`, { method: "DELETE" });
  await fetchReports();
}

function setDefaultReportedAt() {
  const input = document.getElementById("reported-at-input");
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  input.value = now.toISOString().slice(0, 16);
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const message = document.getElementById("form-message");
  message.textContent = "送信中...";

  const formData = new FormData(form);

  const res = await fetch("/api/reports", { method: "POST", body: formData });
  if (res.status === 422) {
    const body = await res.json();
    message.textContent = body.detail;
    document.getElementById("manual-coords").classList.remove("hidden");
    return;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    message.textContent = body.detail || "登録に失敗しました";
    return;
  }

  message.textContent = "報告を登録しました";
  document.getElementById("manual-coords").classList.add("hidden");
  form.reset();
  setDefaultReportedAt();
  document.getElementById("gps-status").textContent = "";
  await fetchReports();
}

function handleImageChange(event) {
  const file = event.target.files[0];
  const status = document.getElementById("gps-status");
  if (!file) {
    status.textContent = "";
    return;
  }
  status.textContent = "画像を選択しました。アップロード時にEXIFから位置情報を自動取得します。";
}

async function init() {
  setDefaultReportedAt();
  document.getElementById("report-form").addEventListener("submit", handleSubmit);
  document.getElementById("image-input").addEventListener("change", handleImageChange);

  const config = await fetch("/api/config").then((r) => r.json());
  loadGoogleMaps(config.google_maps_api_key);

  await fetchReports();
}

init();
