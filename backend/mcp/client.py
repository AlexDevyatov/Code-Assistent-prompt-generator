"""
MCP-клиент: запускает наш stdio MCP-сервер как subprocess, подключается по stdio,
вызывает list_tools() и выводит имя + описание каждого инструмента.
Используется для проверки интеграции MCP в проекте (AI-челлендж).
"""
import asyncio
import os
import sys

# Официальный MCP SDK
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def _project_root() -> str:
    """Корень проекта (где лежит backend/)."""
    path = os.path.abspath(__file__)
    # backend/mcp/client.py -> backend -> project root
    return os.path.dirname(os.path.dirname(os.path.dirname(path)))


async def run_client() -> None:
    """Запуск MCP-сервера как subprocess, list_tools(), вывод инструментов."""
    root = _project_root()
    env = os.environ.copy()
    env["PYTHONPATH"] = root

    server_params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "backend.mcp.server"],
        env=env,
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools_result = await session.list_tools()

            if not tools_result or not hasattr(tools_result, "tools"):
                print("Нет инструментов или неверный ответ сервера.", file=sys.stderr)
                return

            print("MCP tools (name + description):\n")
            for tool in tools_result.tools:
                name = getattr(tool, "name", "?")
                desc = getattr(tool, "description", "") or "(no description)"
                print(f"  - {name}: {desc}")
            print()


def main() -> None:
    """Точка входа для запуска из командной строки."""
    asyncio.run(run_client())


if __name__ == "__main__":
    main()
