"""Роутер для работы с MCP серверами"""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.services.mcp_client import list_mcp_tools

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


class MCPListRequest(BaseModel):
    server_name: str = "mcp-server-google-search"


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
        logger.info(f"Listing tools from MCP server: {request.server_name}")
        
        result = await list_mcp_tools(request.server_name)
        
        return result
        
    except Exception as e:
        logger.error(f"Unexpected error listing MCP tools: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/list-tools/{server_name}")
async def list_tools_get(server_name: str):
    """
    GET endpoint для получения списка инструментов
    
    Args:
        server_name: Имя MCP сервера
    
    Returns:
        Информация о сервере и его инструментах
    """
    try:
        logger.info(f"Listing tools from MCP server: {server_name}")
        
        result = await list_mcp_tools(server_name)
        
        return result
        
    except Exception as e:
        logger.error(f"Unexpected error listing MCP tools: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
