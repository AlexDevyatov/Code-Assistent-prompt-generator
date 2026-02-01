"""
MCP-слой проекта: stdio-сервер и клиент для демонстрации Model Context Protocol.
Не встроен в FastAPI lifespan — работает как отдельный процесс для LLM/агентов.
"""
from backend.mcp.server import run_server

__all__ = ["run_server"]
