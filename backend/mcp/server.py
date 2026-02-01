"""
MCP stdio-сервер: переиспользует бизнес-логику FastAPI (services), не дублирует её.
Запускается отдельным процессом (не внутри FastAPI lifespan) для LLM/агентов.
"""
import json
import logging
import sys

import anyio

from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server
from mcp.types import Tool

# Переиспользуем сервис пользователей из backend — без дублирования логики
from backend.services import users as users_service

logger = logging.getLogger(__name__)

# Имя сервера для протокола MCP
SERVER_NAME = "deepseek-web-mcp"


def _create_server() -> Server:
    """Создаёт MCP-сервер с инструментами health_check и get_users."""
    server = Server(
        name=SERVER_NAME,
        version="1.0.0",
    )

    @server.list_tools()
    async def list_tools(_request=None):
        """Список инструментов: health_check, get_users."""
        return [
            Tool(
                name="health_check",
                description="Проверка доступности сервера. Возвращает {\"status\": \"ok\"}.",
                input_schema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            Tool(
                name="get_users",
                description="Возвращает список пользователей (из сервиса backend).",
                input_schema={
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Максимальное количество записей",
                            "default": 10,
                        },
                    },
                    "required": [],
                },
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> dict:
        """Обработка вызовов: health_check — заглушка, get_users — через users-сервис."""
        if name == "health_check":
            return {"status": "ok"}

        if name == "get_users":
            limit = int(arguments.get("limit", 10))
            users = await users_service.get_users(limit=limit)
            return {"users": users, "count": len(users)}

        raise ValueError(f"Unknown tool: {name}")

    return server


async def _run_stdio() -> None:
    """Запуск сервера поверх stdio (stdin/stdout)."""
    server = _create_server()
    init_options = server.create_initialization_options()

    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, init_options)


def run_server() -> None:
    """Точка входа: запуск MCP-сервера (для subprocess)."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        stream=sys.stderr,
    )
    anyio.run(_run_stdio, backend="asyncio")


if __name__ == "__main__":
    run_server()
