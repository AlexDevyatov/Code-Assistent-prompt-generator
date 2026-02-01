"""
Сервис пользователей — минимальная заглушка для демонстрации MCP.
Переиспользуется MCP-сервером (app/mcp) и при необходимости FastAPI-роутами.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def get_users(limit: int = 10) -> list[dict[str, Any]]:
    """
    Возвращает список пользователей (заглушка).
    В production здесь был бы вызов репозитория/БД.
    """
    # Заглушка: статический список для демонстрации интеграции MCP с backend
    stub_users = [
        {"id": 1, "username": "alice", "email": "alice@example.com"},
        {"id": 2, "username": "bob", "email": "bob@example.com"},
        {"id": 3, "username": "charlie", "email": "charlie@example.com"},
    ]
    result = stub_users[:limit]
    logger.debug("get_users called, limit=%s, returned %s items", limit, len(result))
    return result
