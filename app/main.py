import os
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import database
from .exif_utils import extract_gps

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
STATIC_DIR = BASE_DIR / "static"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="災害位置情報報告システム")

database.init_db()

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

VALID_STATUSES = ["未対応", "対応中", "対応済み"]


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/config")
def get_config():
    return {"google_maps_api_key": os.environ.get("GOOGLE_MAPS_API_KEY", "")}


@app.post("/api/reports")
async def create_report(
    image: UploadFile = File(...),
    reported_at: str = Form(...),
    damage_info: str = Form(...),
    status: str = Form("未対応"),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
):
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="不正な対応状況です")

    suffix = Path(image.filename or "").suffix
    saved_name = f"{uuid.uuid4().hex}{suffix}"
    saved_path = UPLOAD_DIR / saved_name

    with saved_path.open("wb") as f:
        shutil.copyfileobj(image.file, f)

    coords = extract_gps(str(saved_path))
    if coords:
        lat, lng = coords
    elif latitude is not None and longitude is not None:
        lat, lng = latitude, longitude
    else:
        saved_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail="画像から位置情報を取得できませんでした。緯度・経度を手入力してください。",
        )

    conn = database.get_connection()
    cur = conn.execute(
        """
        INSERT INTO reports (latitude, longitude, image_path, reported_at, damage_info, status)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (lat, lng, f"/uploads/{saved_name}", reported_at, damage_info, status),
    )
    conn.commit()
    report_id = cur.lastrowid
    row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    conn.close()

    return dict(row)


@app.get("/api/reports")
def list_reports():
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM reports ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.patch("/api/reports/{report_id}")
def update_report_status(report_id: int, status: str = Form(...)):
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="不正な対応状況です")

    conn = database.get_connection()
    cur = conn.execute("UPDATE reports SET status = ? WHERE id = ?", (status, report_id))
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    conn.close()
    return dict(row)


@app.delete("/api/reports/{report_id}")
def delete_report(report_id: int):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="報告が見つかりません")

    image_path = BASE_DIR / row["image_path"].lstrip("/")
    conn.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    conn.commit()
    conn.close()

    image_path.unlink(missing_ok=True)
    return {"deleted": report_id}
