"""Хранение суммаризаций диалога в SQLite (только stdlib sqlite3, потокобезопасно)."""
import sqlite3
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Путь к БД в директории с гарантированными правами записи пользователя
_DB_DIR = Path.home() / ".local" / "share" / "code-assistent-prompt-generator" / "data"
_DB_PATH = _DB_DIR / "summaries.db"

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY,
    summary TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
"""


def _get_connection() -> sqlite3.Connection:
    """Новое соединение для каждого запроса — потокобезопасно."""
    _DB_DIR.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(_DB_PATH, isolation_level="DEFERRED")


def init_db() -> None:
    """Инициализация БД: создаёт таблицу summaries при первом запуске."""
    with _get_connection() as conn:
        conn.execute(_CREATE_TABLE_SQL)
        conn.commit()
    logger.info("Summaries DB initialized at %s", _DB_PATH)


def save_summary(summary_text: str) -> None:
    """Сохраняет одну суммаризацию в БД."""
    if not summary_text or not summary_text.strip():
        return
    with _get_connection() as conn:
        conn.execute(
            "INSERT INTO summaries (summary) VALUES (?)",
            (summary_text.strip(),),
        )
        conn.commit()
    logger.info("Saved summary, length=%d", len(summary_text))


def get_latest_summary() -> Optional[str]:
    """Возвращает текст последней сохранённой суммаризации или None."""
    with _get_connection() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT summary FROM summaries ORDER BY id DESC LIMIT 1"
        ).fetchone()
    if row is None:
        return None
    return row["summary"]


def clear_all() -> None:
    """Удаляет все записи из таблицы summaries."""
    with _get_connection() as conn:
        conn.execute("DELETE FROM summaries")
        conn.commit()
    logger.info("Cleared all summaries")
