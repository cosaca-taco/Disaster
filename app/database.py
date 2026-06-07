import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "reports.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            image_path TEXT NOT NULL,
            reported_at TEXT NOT NULL,
            damage_info TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT '未対応',
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
        """
    )
    conn.commit()
    conn.close()
