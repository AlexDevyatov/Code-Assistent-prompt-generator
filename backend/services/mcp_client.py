"""Сервис для подключения к MCP серверам"""
import logging
import json
import asyncio
import os
import shutil
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Попытка импортировать MCP SDK
try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    MCP_AVAILABLE = True
except ImportError as e:
    MCP_AVAILABLE = False
    IMPORT_ERROR = str(e)
    logger.warning(f"MCP SDK not available: {IMPORT_ERROR}. Using fallback implementation.")


async def _list_tools_with_sdk(server_name: str) -> Dict[str, Any]:
    """Использование официального MCP SDK для получения инструментов"""
    server_params = StdioServerParameters(
        command=server_name,
        args=[],
        env=None
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools_result = await session.list_tools()
            
            server_info = {
                "name": server_name,
                "tools": []
            }
            
            if tools_result and hasattr(tools_result, 'tools'):
                for tool in tools_result.tools:
                    tool_info = {
                        "name": tool.name,
                        "description": tool.description or "",
                        "inputSchema": getattr(tool, 'inputSchema', {})
                    }
                    server_info["tools"].append(tool_info)
            
            return server_info


async def _list_tools_with_fallback(server_name: str) -> Dict[str, Any]:
    """Fallback реализация через прямое взаимодействие с MCP сервером по JSON-RPC"""
    try:
        # Проверяем, что бинарь доступен (абсолютный путь или в PATH)
        resolved = server_name if os.path.isabs(server_name) else shutil.which(server_name)
        if not resolved:
            raise FileNotFoundError(f"MCP server '{server_name}' not found in PATH")

        # Запускаем MCP сервер как subprocess
        process = await asyncio.create_subprocess_exec(
            resolved,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        if not process.stdin or not process.stdout:
            raise RuntimeError("Failed to create subprocess pipes")
        
        # Отправляем initialize запрос (JSON-RPC 2.0)
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "deepseek-web-client",
                    "version": "1.0.0"
                }
            }
        }
        
        init_message = json.dumps(init_request) + "\n"
        process.stdin.write(init_message.encode('utf-8'))
        await process.stdin.drain()
        
        # Читаем ответ на initialize
        init_response_line = await asyncio.wait_for(
            process.stdout.readline(), timeout=5.0
        )
        if not init_response_line:
            raise RuntimeError("No response from server")
        
        init_response = json.loads(init_response_line.decode('utf-8'))
        
        # Отправляем initialized notification
        initialized_notification = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        process.stdin.write((json.dumps(initialized_notification) + "\n").encode('utf-8'))
        await process.stdin.drain()
        
        # Отправляем запрос на получение списка инструментов
        tools_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        
        process.stdin.write((json.dumps(tools_request) + "\n").encode('utf-8'))
        await process.stdin.drain()
        
        # Читаем ответ
        tools_response_line = await asyncio.wait_for(
            process.stdout.readline(), timeout=5.0
        )
        if not tools_response_line:
            raise RuntimeError("No response to tools/list request")
        
        tools_response = json.loads(tools_response_line.decode('utf-8'))
        
        # Закрываем процесс
        process.stdin.close()
        await process.wait()
        
        # Обрабатываем ответ
        server_info = {
            "name": server_name,
            "tools": []
        }
        
        if "result" in tools_response and "tools" in tools_response["result"]:
            for tool in tools_response["result"]["tools"]:
                tool_info = {
                    "name": tool.get("name", ""),
                    "description": tool.get("description", ""),
                    "inputSchema": tool.get("inputSchema", {})
                }
                server_info["tools"].append(tool_info)
        
        return server_info
        
    except FileNotFoundError:
        # Пробрасываем выше, чтобы сработала дружественная обработка в list_mcp_tools
        raise
    except asyncio.TimeoutError:
        raise RuntimeError("Timeout waiting for MCP server response")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON response from server: {e}")
    except Exception as e:
        raise RuntimeError(f"Error communicating with MCP server: {e}")


async def list_mcp_tools(server_name: str) -> Dict[str, Any]:
    """
    Получение списка доступных инструментов от MCP сервера
    
    Args:
        server_name: Имя MCP сервера (команда, доступная в PATH)
    
    Returns:
        Словарь с информацией о сервере и инструментах
    """
    try:
        # Пробуем использовать официальный SDK, если доступен
        if MCP_AVAILABLE:
            return await _list_tools_with_sdk(server_name)
        else:
            # Используем fallback реализацию
            logger.info(f"Using fallback MCP implementation for {server_name}")
            return await _list_tools_with_fallback(server_name)
            
    except FileNotFoundError:
        logger.error(f"MCP server '{server_name}' not found. Make sure it's installed and in PATH.")
        
        # Определяем npm пакет на основе имени сервера
        npm_package = None
        server_lower = server_name.lower()
        if "http" in server_lower:
            npm_package = None  # No official http server package
            install_cmd = "Create your own using @modelcontextprotocol/sdk or use a different server"
        elif "google" in server_lower or "search" in server_lower:
            npm_package = "@mcp-server/google-search-mcp"
        elif "filesystem" in server_lower:
            npm_package = "@modelcontextprotocol/server-filesystem"
        else:
            # Пытаемся угадать из имени сервера
            server_part = server_name.replace("mcp-server-", "").replace("mcp_", "").replace("mcp-", "")
            if server_part:
                npm_package = f"@mcp-server/{server_part}-mcp"
            else:
                npm_package = None
        
        if npm_package:
            install_cmd = f"npm install -g {npm_package}"
        else:
            install_cmd = "Check available packages at https://www.npmjs.com/search?q=mcp-server or create your own using @modelcontextprotocol/sdk"
        
        error_msg = (
            f"Server '{server_name}' not found. Make sure it's installed and available in PATH.\n\n"
            f"To install MCP servers, you can:\n"
            f"1. Install via npm: {install_cmd}\n"
            f"2. Or use the MCP server's installation instructions\n"
            f"3. Make sure the server binary is in your PATH\n\n"
            f"You can check if it's installed by running: which {server_name}"
        )
        return {
            "name": server_name,
            "error": error_msg,
            "tools": []
        }
    except Exception as e:
        logger.error(f"Error listing tools from MCP server {server_name}: {str(e)}", exc_info=True)
        return {
            "name": server_name,
            "error": str(e),
            "tools": []
        }
