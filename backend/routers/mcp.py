"""Роутер для работы с MCP серверами"""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

from backend.services.mcp_client import list_mcp_tools, call_mcp_tool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


class MCPListRequest(BaseModel):
    server_name: str = "mcp-server-google-search"
    locale: Optional[str] = "ru-RU"  # Язык для ответов (ru-RU, en-US, zh-CN и т.д.)


@router.post("/list-tools")
async def list_tools(request: MCPListRequest):
    """
    Получение списка доступных инструментов от MCP сервера
    
    Args:
        request: Запрос с именем сервера
    
    Returns:
        Информация о сервере и его инструментах
    """
    try:
        logger.info(f"Listing tools from MCP server: {request.server_name} with locale: {request.locale}")
        
        result = await list_mcp_tools(request.server_name, locale=request.locale or "ru-RU")
        
        return result
        
    except Exception as e:
        logger.error(f"Unexpected error listing MCP tools: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/list-tools/{server_name}")
async def list_tools_get(server_name: str, summary: bool = False, locale: str = "ru-RU"):
    """
    GET endpoint для получения списка инструментов
    
    Args:
        server_name: Имя MCP сервера
        summary: Если True, возвращает только краткий список инструментов без полных схем
        locale: Язык для ответов (ru-RU, en-US, zh-CN и т.д.)
    
    Returns:
        Информация о сервере и его инструментах
    """
    try:
        logger.info(f"Listing tools from MCP server: {server_name} with locale: {locale}")
        
        result = await list_mcp_tools(server_name, locale=locale)
        
        # Если запрошен summary, возвращаем упрощенный формат
        if summary:
            return {
                "name": result.get("name"),
                "tools_count": len(result.get("tools", [])),
                "tools": [
                    {
                        "name": tool.get("name"),
                        "description": tool.get("description", "")[:200] if tool.get("description") else "No description"
                    }
                    for tool in result.get("tools", [])
                ]
            }
        
        return result
        
    except Exception as e:
        logger.error(f"Unexpected error listing MCP tools: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/list-tools/{server_name}/summary")
async def list_tools_summary(server_name: str):
    """
    GET endpoint для получения краткого списка инструментов (без полных схем)
    
    Args:
        server_name: Имя MCP сервера
    
    Returns:
        Краткая информация о сервере и его инструментах
    """
    return await list_tools_get(server_name, summary=True)


class MCPCallToolRequest(BaseModel):
    """Запрос на вызов инструмента MCP сервера"""
    server_name: str = "mcp-weather"
    tool_name: str
    arguments: Dict[str, Any] = {}
    locale: Optional[str] = "ru-RU"


@router.post("/call-tool")
async def call_tool(request: MCPCallToolRequest):
    """
    Вызов инструмента MCP сервера (например, mcp-weather на порту 9001).
    
    Args:
        request: server_name, tool_name, arguments, locale
    
    Returns:
        Результат вызова (content, isError и т.д.)
    """
    try:
        logger.info(
            f"Calling MCP tool: server={request.server_name}, "
            f"tool={request.tool_name}, args={request.arguments}"
        )
        result = await call_mcp_tool(
            request.server_name,
            request.tool_name,
            request.arguments,
            locale=request.locale or "ru-RU",
        )
        return result
    except Exception as e:
        logger.error(f"Error calling MCP tool: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
