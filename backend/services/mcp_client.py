"""Сервис для подключения к MCP серверам"""
import logging
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
    logger.warning(f"MCP SDK not available: {IMPORT_ERROR}. MCP features will be disabled.")


async def list_mcp_tools(server_name: str) -> Dict[str, Any]:
    """
    Получение списка доступных инструментов от MCP сервера
    
    Args:
        server_name: Имя MCP сервера (команда, доступная в PATH)
    
    Returns:
        Словарь с информацией о сервере и инструментах
    """
    if not MCP_AVAILABLE:
        return {
            "name": server_name,
            "error": f"MCP SDK is not available. {IMPORT_ERROR}. Please install MCP package (requires Python 3.10+): pip install mcp",
            "tools": []
        }
    
    try:
        # Параметры для подключения к серверу через stdio
        # Предполагаем, что сервер доступен как команда в PATH
        server_params = StdioServerParameters(
            command=server_name,
            args=[],
            env=None
        )
        
        # Подключаемся к серверу и получаем список инструментов
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Получаем список инструментов
                tools_result = await session.list_tools()
                
                # Получаем информацию о сервере
                server_info = {
                    "name": server_name,
                    "tools": []
                }
                
                # tools_result имеет атрибут .tools со списком инструментов
                if tools_result and hasattr(tools_result, 'tools'):
                    for tool in tools_result.tools:
                        tool_info = {
                            "name": tool.name,
                            "description": tool.description or "",
                            "inputSchema": getattr(tool, 'inputSchema', {})
                        }
                        server_info["tools"].append(tool_info)
                
                return server_info
                
    except FileNotFoundError:
        logger.error(f"MCP server '{server_name}' not found. Make sure it's installed and in PATH.")
        return {
            "name": server_name,
            "error": f"Server '{server_name}' not found. Make sure it's installed and available in PATH.",
            "tools": []
        }
    except Exception as e:
        logger.error(f"Error listing tools from MCP server {server_name}: {str(e)}", exc_info=True)
        return {
            "name": server_name,
            "error": str(e),
            "tools": []
        }
