#!/usr/bin/env python3
"""
Взаимодействие с MCP сервером на порту 9001.

Использование:
  python interact_mcp_9001.py                    # список инструментов
  python interact_mcp_9001.py <tool> [args...]   # вызов инструмента (args в формате key=value)

Примеры:
  python interact_mcp_9001.py
  python interact_mcp_9001.py get_current_weather location=Moscow
  python interact_mcp_9001.py get_current_weather location="New York"
"""
import argparse
import asyncio
import json
import sys
from typing import Any, Dict

import httpx

MCP_URL = "http://185.28.85.26:9001"
# Для SSE/HTTP MCP часто используется endpoint /messages/
MCP_MESSAGES_URL = f"{MCP_URL.rstrip('/')}/messages/"


async def _request(method: str, params: Dict[str, Any], request_id: int = 1) -> Dict[str, Any]:
    """Отправка JSON-RPC запроса к MCP серверу (пробуем /messages/ и корень)."""
    body = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}
    last_error = None
    async with httpx.AsyncClient(timeout=30.0) as client:
        for url in (MCP_MESSAGES_URL, MCP_URL):
            try:
                r = await client.post(url, json=body, headers={"Content-Type": "application/json"})
                r.raise_for_status()
                data = r.json()
                if "error" in data:
                    raise RuntimeError(data["error"].get("message", data["error"]))
                return data.get("result", {})
            except (httpx.HTTPStatusError, httpx.ConnectError, RuntimeError) as e:
                last_error = e
                continue
    if last_error:
        raise last_error
    return {}


async def list_tools() -> None:
    """Получить и вывести список инструментов с порта 9001."""
    try:
        result = await _request("tools/list", {}, request_id=1)
    except httpx.ConnectError:
        print(f"❌ Не удалось подключиться к MCP серверу по адресу {MCP_URL}")
        print("   Убедитесь, что MCP сервер запущен на порту 9001.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        sys.exit(1)

    tools = result.get("tools", [])
    print(f"\n{'='*60}")
    print(f"📦 MCP сервер: {MCP_URL}")
    print(f"{'='*60}\n")
    if not tools:
        print("⚠️  Инструменты не найдены.")
        return
    print(f"🔧 Доступно инструментов: {len(tools)}\n")
    for i, t in enumerate(tools, 1):
        name = t.get("name", "?")
        desc = (t.get("description") or "")[:120]
        print(f"  {i}. {name}")
        if desc:
            print(f"     {desc}")
        schema = t.get("inputSchema", {})
        props = schema.get("properties", {})
        if props:
            print(f"     Параметры: {', '.join(props.keys())}")
        print()
    print(f"{'='*60}\n")


def _parse_args(args: list) -> Dict[str, Any]:
    """Парсинг аргументов вида key=value в словарь."""
    out = {}
    for s in args:
        if "=" in s:
            k, v = s.split("=", 1)
            k = k.strip()
            v = v.strip()
            if v.startswith('"') and v.endswith('"'):
                v = v[1:-1]
            if v.lower() in ("true", "false"):
                v = v.lower() == "true"
            elif v.isdigit():
                v = int(v)
            out[k] = v
        else:
            out[s] = True
    return out


async def call_tool(tool_name: str, arguments: Dict[str, Any]) -> None:
    """Вызвать инструмент на MCP сервере и вывести результат."""
    try:
        result = await _request(
            "tools/call",
            {"name": tool_name, "arguments": arguments},
            request_id=2,
        )
    except httpx.ConnectError:
        print(f"❌ Не удалось подключиться к MCP серверу по адресу {MCP_URL}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        sys.exit(1)

    content = result.get("content", [])
    is_error = result.get("isError", False)
    if is_error:
        print("❌ Инструмент вернул ошибку:\n")
    for item in content:
        if isinstance(item, dict):
            text = item.get("text", item.get("content", str(item)))
        else:
            text = str(item)
        print(text)
    if not content:
        print(json.dumps(result, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(
        description="Взаимодействие с MCP сервером на порту 9001",
        epilog="Примеры: %(prog)s  |  %(prog)s get_current_weather location=Moscow",
    )
    parser.add_argument(
        "tool",
        nargs="?",
        help="Имя инструмента для вызова (если не указано — вывод списка инструментов)",
    )
    parser.add_argument(
        "args",
        nargs="*",
        help="Аргументы в формате key=value (например: location=Moscow)",
    )
    parser.add_argument(
        "--url",
        default=MCP_URL,
        help=f"URL MCP сервера (по умолчанию {MCP_URL})",
    )
    ns = parser.parse_args()
    global MCP_URL, MCP_MESSAGES_URL
    if ns.url != MCP_URL:
        MCP_URL = ns.url.rstrip("/")
        MCP_MESSAGES_URL = f"{MCP_URL}/messages/"

    if ns.tool:
        arguments = _parse_args(ns.args)
        asyncio.run(call_tool(ns.tool, arguments))
    else:
        asyncio.run(list_tools())


if __name__ == "__main__":
    main()
