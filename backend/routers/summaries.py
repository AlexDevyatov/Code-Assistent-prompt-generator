"""Роутер для работы с сохранёнными суммаризациями."""
import logging
from fastapi import APIRouter

from backend.services.summaries_db import get_latest_summary, clear_all, is_db_available

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["summaries"])


@router.get("/summaries/status")
def api_summaries_status():
    """Возвращает статус БД суммаризаций (для проверки после деплоя)."""
    return {"db_available": is_db_available()}


@router.get("/summaries/latest")
def api_get_latest_summary():
    """Возвращает последнюю сохранённую суммаризацию или null."""
    summary = get_latest_summary()
    return {"summary": summary}


@router.post("/clear-history")
def api_clear_history():
    """Удаляет все записи из таблицы summaries."""
    clear_all()
    return {"status": "ok"}
