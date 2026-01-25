"""Хранение суммаризаций диалога в SQLite (только stdlib sqlite3, потокобезопасно)."""
import os
import sqlite3
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Путь к каталогу БД: SUMMARIES_DB_DIR в systemd, иначе проект/data (локально и если задано при деплое)
_project_root = Path(__file__).resolve().parent.parent.parent
_DB_DIR = Path(os.environ["SUMMARIES_DB_DIR"]) if os.environ.get("SUMMARIES_DB_DIR") else (_project_root / "data")
_DB_PATH = _DB_DIR / "summaries.db"
_db_available = False  # устанавливается в True в init_db() при успехе

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
    """Инициализация БД: создаёт таблицу summaries при первом запуске. При ошибке прав — логирует и не падает."""
    global _db_available
    try:
        with _get_connection() as conn:
            conn.execute(_CREATE_TABLE_SQL)
            conn.commit()
        _db_available = True
        logger.info("Summaries DB initialized at %s", _DB_PATH)
    except OSError as e:
        _db_available = False
        logger.warning(
            "Summaries DB unavailable (directory %s not writable): %s. Summaries will not be persisted.",
            _DB_DIR,
            e,
        )


def save_summary(summary_text: str) -> None:
    """Сохраняет одну суммаризацию в БД."""
    if not _db_available or not summary_text or not summary_text.strip():
        return
    try:
        with _get_connection() as conn:
            conn.execute(
                "INSERT INTO summaries (summary) VALUES (?)",
                (summary_text.strip(),),
            )
            conn.commit()
        logger.info("Saved summary, length=%d", len(summary_text))
    except OSError as e:
        logger.warning("Could not save summary: %s", e)


def get_latest_summary() -> Optional[str]:
    """Возвращает текст последней сохранённой суммаризации или None."""
    if not _db_available:
        return None
    try:
        with _get_connection() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT summary FROM summaries ORDER BY id DESC LIMIT 1"
            ).fetchone()
        if row is None:
            return None
        return row["summary"]
    except OSError as e:
        logger.warning("Could not read latest summary: %s", e)
        return None


def clear_all() -> None:
    """Удаляет все записи из таблицы summaries."""
    if not _db_available:
        return
    try:
        with _get_connection() as conn:
            conn.execute("DELETE FROM summaries")
            conn.commit()
        logger.info("Cleared all summaries")
    except OSError as e:
        logger.warning("Could not clear summaries: %s", e)
