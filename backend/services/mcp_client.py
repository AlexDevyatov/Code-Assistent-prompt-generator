"""Сервис для подключения к MCP серверам"""
import logging
import json
import asyncio
import os
import shutil
from typing import Dict, Any, Optional
from urllib.parse import urlparse, urlunparse
import httpx

# Импортируем конфигурацию для HTTP подключения
try:
    from backend.config import MCP_WEATHER_SERVER_URL, MCP_USE_HTTP
except ImportError:
    # Если конфигурация не доступна, используем значения по умолчанию
    MCP_WEATHER_SERVER_URL = os.getenv("MCP_WEATHER_SERVER_URL", "http://185.28.85.26:8001")
    MCP_USE_HTTP = os.getenv("MCP_USE_HTTP", "true").lower() == "true"

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


def _find_npx() -> Optional[str]:
    """
    Находит npx в PATH или в стандартных местах
    
    Returns:
        Путь к npx или None, если не найден
    """
    # Сначала пробуем найти в PATH
    npx_path = shutil.which("npx")
    if npx_path:
        return npx_path
    
    # Если не найден в PATH, пробуем стандартные места
    standard_paths = [
        "/opt/homebrew/bin/npx",  # Homebrew на Apple Silicon
        "/usr/local/bin/npx",      # Homebrew на Intel Mac / Linux
        "/usr/bin/npx",            # Системный
        os.path.expanduser("~/.npm-global/bin/npx"),  # npm global
    ]
    
    for path in standard_paths:
        if os.path.exists(path) and os.access(path, os.X_OK):
            logger.info(f"Found npx at standard location: {path}")
            return path
    
    return None


def _get_node_paths() -> list:
    """
    Находит пути к node и npm для добавления в PATH
    
    Returns:
        Список путей к директориям с node/npm
    """
    paths = []
    
    # Ищем node в стандартных местах
    node_paths = [
        "/opt/homebrew/bin",      # Homebrew на Apple Silicon
        "/usr/local/bin",         # Homebrew на Intel Mac / Linux
        "/usr/bin",               # Системный
        os.path.expanduser("~/.npm-global/bin"),  # npm global
    ]
    
    for path in node_paths:
        if os.path.exists(os.path.join(path, "node")):
            paths.append(path)
    
    # Также проверяем через which, если доступен
    node_path = shutil.which("node")
    if node_path:
        node_dir = os.path.dirname(node_path)
        if node_dir not in paths:
            paths.insert(0, node_dir)
    
    return paths


def _resolve_mcp_server_command(server_name: str) -> Optional[str]:
    """
    Находит правильное имя команды для MCP сервера, проверяя оригинальное имя
    и альтернативные варианты.
    
    Args:
        server_name: Исходное имя сервера
        
    Returns:
        Найденное имя команды (или полный путь, если найден) или None, если не найдено
    """
    # Сначала проверяем оригинальное имя
    if os.path.isabs(server_name):
        if os.path.exists(server_name):
            return server_name
    else:
        resolved = shutil.which(server_name)
        if resolved:
            # Возвращаем полный путь для надежности
            return resolved
    
    # Если не найдено, пробуем альтернативные имена
    alternative_names = []
    server_lower = server_name.lower()
    
    if "google" in server_lower or "search" in server_lower:
        alternative_names = [
            "google-search-mcp",
            "mcp-server-google-search",
            "google-search"
        ]
    elif "filesystem" in server_lower:
        alternative_names = [
            "mcp-server-filesystem",
            "filesystem-mcp"
        ]
    elif "weather" in server_lower:
        # Для MCP-Weather сервера пробуем найти Python скрипт
        # Проверяем стандартные пути для установленного сервера
        weather_paths = [
            os.path.expanduser("~/MCP-Weather/server.py"),
            os.path.expanduser("~/.local/share/mcp-weather/server.py"),
            "/opt/mcp-weather/server.py",
        ]
        for path in weather_paths:
            if os.path.exists(path):
                # Возвращаем команду для запуска через Python
                python_path = shutil.which("python3") or shutil.which("python")
                if python_path:
                    logger.info(f"Found MCP-Weather server at: {path}")
                    return f"{python_path} {path}"
        alternative_names = [
            "mcp-weather",
            "weather-mcp",
            "mcp-server-weather"
        ]
    
    # Пробуем найти альтернативные имена
    for alt_name in alternative_names:
        alt_resolved = shutil.which(alt_name)
        if alt_resolved:
            logger.info(f"Found MCP server with alternative name: {alt_name} (requested: {server_name}) -> {alt_resolved}")
            # Возвращаем полный путь для надежности
            return alt_resolved
    
    return None


async def _list_tools_with_sdk(server_name: str, locale: str = "ru-RU") -> Dict[str, Any]:
    """Использование официального MCP SDK для получения инструментов"""
    # Пытаемся найти правильное имя команды
    resolved_command = _resolve_mcp_server_command(server_name)
    if not resolved_command:
        raise FileNotFoundError(f"MCP server '{server_name}' not found in PATH")
    
    server_params = StdioServerParameters(
        command=resolved_command,
        args=[],
        env=None
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Инициализация с указанием языка через clientInfo
            # MCP SDK может не поддерживать locale напрямую, поэтому передаем через clientInfo
            try:
                await session.initialize()
            except Exception:
                # Если стандартная инициализация не работает, пробуем с параметрами
                pass
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


async def _list_tools_with_fallback(server_name: str, locale: str = "ru-RU") -> Dict[str, Any]:
    """Fallback реализация через прямое взаимодействие с MCP сервером по JSON-RPC"""
    try:
        # Проверяем доступность npx в начале
        npx_path = shutil.which("npx")
        if not npx_path:
            logger.warning("npx not found in PATH, MCP servers may not work")
        
        # Определяем команду для запуска сервера
        # Используем вспомогательную функцию для поиска правильного имени
        resolved_command = _resolve_mcp_server_command(server_name)
        resolved = None
        npx_args = None
        
        logger.info(f"Resolving MCP server '{server_name}': found command = {resolved_command}")
        
        if resolved_command:
            # Функция уже возвращает полный путь, если найден
            if os.path.exists(resolved_command):
                resolved = resolved_command
                logger.info(f"Using resolved binary: {resolved}")
            elif os.path.isabs(resolved_command):
                # Если это абсолютный путь, но файл не существует, пробуем найти через which
                resolved = shutil.which(os.path.basename(resolved_command)) or resolved_command
                logger.info(f"Using absolute path or which result: {resolved}")
            else:
                # Если это имя команды, пробуем найти его
                resolved = shutil.which(resolved_command)
                logger.info(f"Using which result: {resolved}")
        
        # Если бинарь все еще не найден, пытаемся использовать npx с соответствующим пакетом
        if not resolved:
            logger.info(f"Binary not found for {server_name}, will use npx fallback")
            # Проверяем, доступен ли npx (включая стандартные места)
            npx_path = _find_npx()
            if not npx_path:
                # Если npx тоже не найден, это критическая ошибка
                raise FileNotFoundError(f"Neither MCP server '{server_name}' nor 'npx' found in PATH or standard locations")
            
            # Определяем npm пакет на основе имени сервера
            npm_package = None
            if "google" in server_name.lower() or "search" in server_name.lower():
                npm_package = "@mcp-server/google-search-mcp"
            elif "filesystem" in server_name.lower():
                npm_package = "@modelcontextprotocol/server-filesystem"
            else:
                # Пытаемся угадать пакет из имени
                server_part = server_name.replace("mcp-server-", "").replace("mcp_", "").replace("mcp-", "")
                if server_part:
                    npm_package = f"@mcp-server/{server_part}-mcp"
            
            if npm_package:
                # Используем npx для запуска
                resolved = npx_path
                npx_args = ["-y", npm_package]
                logger.info(f"Using npx to run {npm_package}")
            else:
                raise FileNotFoundError(f"MCP server '{server_name}' not found in PATH and no npx package available")

        # Запускаем MCP сервер как subprocess
        # Если бинарник найден, но не через npx, пробуем запустить напрямую
        # Если не получается, используем npx как fallback
        process = None
        use_npx_fallback = False
        
        if npx_args:
            # Используем npx для запуска
            try:
                # Подготавливаем переменные окружения с правильным PATH
                env = dict(os.environ)
                if "python" in resolved.lower():
                    env["PYTHONUNBUFFERED"] = "1"
                
                # Добавляем пути к node в PATH, если их там нет
                node_paths = _get_node_paths()
                current_path = env.get("PATH", "").split(os.pathsep)
                for node_path in node_paths:
                    if node_path not in current_path:
                        current_path.insert(0, node_path)
                env["PATH"] = os.pathsep.join(current_path)
                
                # Настраиваем npm cache в временной директории, чтобы избежать проблем с правами
                # Используем временную директорию или домашнюю директорию текущего пользователя
                try:
                    # Пробуем использовать домашнюю директорию текущего пользователя
                    user_home = os.path.expanduser("~")
                    # Проверяем, что это не системная директория без прав
                    if user_home.startswith("/var/www") or not os.access(user_home, os.W_OK):
                        # Используем временную директорию
                        npm_cache_dir = os.path.join(os.path.expanduser("~"), ".npm-cache-mcp")
                        # Если и это не работает, используем системную временную директорию
                        if not os.access(os.path.dirname(npm_cache_dir), os.W_OK):
                            npm_cache_dir = os.path.join("/tmp", f"npm-cache-mcp-{os.getuid()}")
                    else:
                        npm_cache_dir = os.path.join(user_home, ".npm-cache-mcp")
                except Exception:
                    # В крайнем случае используем /tmp
                    npm_cache_dir = os.path.join("/tmp", f"npm-cache-mcp-{os.getuid()}")
                
                # Создаем директорию, если её нет
                try:
                    os.makedirs(npm_cache_dir, exist_ok=True, mode=0o700)
                except (OSError, PermissionError):
                    # Если не получилось создать, используем /tmp
                    npm_cache_dir = os.path.join("/tmp", f"npm-cache-mcp-{os.getuid()}")
                    os.makedirs(npm_cache_dir, exist_ok=True, mode=0o700)
                
                env["NPM_CONFIG_CACHE"] = npm_cache_dir
                # Не устанавливаем NPM_CONFIG_PREFIX, чтобы не создавать проблем
                
                # Используем --yes для автоматического подтверждения и --prefer-offline для избежания проблем с кэшем
                npx_args_with_flags = list(npx_args)
                if "-y" not in npx_args_with_flags:
                    npx_args_with_flags.insert(0, "-y")
                
                logger.info(f"Using npx with PATH: {env['PATH'][:100]}..., cache: {npm_cache_dir}")
                
                # Используем unbuffered режим для stdout/stderr
                process = await asyncio.create_subprocess_exec(
                    resolved,
                    *npx_args_with_flags,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env
                )
            except Exception as e:
                logger.warning(f"Failed to start with npx: {e}")
                raise
        else:
            # Используем прямой бинарь, но если не получается, пробуем npx
            try:
                # Подготавливаем переменные окружения
                env = dict(os.environ)
                if "python" in resolved.lower():
                    env["PYTHONUNBUFFERED"] = "1"
                
                # Добавляем пути к node в PATH, если их там нет (на случай, если бинарник тоже использует node)
                node_paths = _get_node_paths()
                current_path = env.get("PATH", "").split(os.pathsep)
                for node_path in node_paths:
                    if node_path not in current_path:
                        current_path.insert(0, node_path)
                env["PATH"] = os.pathsep.join(current_path)
                
                # Используем unbuffered режим для stdout/stderr
                process = await asyncio.create_subprocess_exec(
                    resolved,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env
                )
            except (FileNotFoundError, OSError) as e:
                # Если прямой запуск не удался, пробуем через npx
                logger.info(f"Direct binary execution failed for {resolved}, trying npx fallback: {e}")
                npx_path = _find_npx()
                if npx_path and ("google" in server_name.lower() or "search" in server_name.lower()):
                    npm_package = "@mcp-server/google-search-mcp"
                    resolved = npx_path
                    npx_args = ["-y", npm_package]
                    
                    # Подготавливаем переменные окружения с правильным PATH
                    env = dict(os.environ)
                    node_paths = _get_node_paths()
                    current_path = env.get("PATH", "").split(os.pathsep)
                    for node_path in node_paths:
                        if node_path not in current_path:
                            current_path.insert(0, node_path)
                    env["PATH"] = os.pathsep.join(current_path)
                    
                    # Настраиваем npm cache в временной директории, чтобы избежать проблем с правами
                    try:
                        # Пробуем использовать домашнюю директорию текущего пользователя
                        user_home = os.path.expanduser("~")
                        # Проверяем, что это не системная директория без прав
                        if user_home.startswith("/var/www") or not os.access(user_home, os.W_OK):
                            # Используем временную директорию
                            npm_cache_dir = os.path.join("/tmp", f"npm-cache-mcp-{os.getuid()}")
                        else:
                            npm_cache_dir = os.path.join(user_home, ".npm-cache-mcp")
                    except Exception:
                        # В крайнем случае используем /tmp
                        npm_cache_dir = os.path.join("/tmp", f"npm-cache-mcp-{os.getuid()}")
                    
                    # Создаем директорию, если её нет
                    try:
                        os.makedirs(npm_cache_dir, exist_ok=True, mode=0o700)
                    except (OSError, PermissionError):
                        # Если не получилось создать, используем /tmp
                        npm_cache_dir = os.path.join("/tmp", f"npm-cache-mcp-{os.getuid()}")
                        os.makedirs(npm_cache_dir, exist_ok=True, mode=0o700)
                    
                    env["NPM_CONFIG_CACHE"] = npm_cache_dir
                    # Не устанавливаем NPM_CONFIG_PREFIX, чтобы не создавать проблем
                    
                    process = await asyncio.create_subprocess_exec(
                        resolved,
                        *npx_args,
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        env=env
                    )
                else:
                    raise
        
        if not process or not process.stdin or not process.stdout:
            raise RuntimeError("Failed to create subprocess pipes")
        
        # Даем процессу немного времени на запуск
        await asyncio.sleep(0.5)
        
        # Проверяем, не завершился ли процесс с ошибкой
        if process.returncode is not None:
            # Процесс уже завершился, читаем stderr
            stderr_output = b""
            if process.stderr:
                try:
                    stderr_output = await asyncio.wait_for(process.stderr.read(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass
            error_msg = stderr_output.decode('utf-8', errors='ignore') if stderr_output else "Unknown error"
            raise RuntimeError(f"MCP server process exited with code {process.returncode}: {error_msg}")
        
        logger.info(f"MCP server process started, PID: {process.pid}")
        
        # Отправляем initialize запрос (JSON-RPC 2.0) с указанием языка
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "deepseek-web-client",
                    "version": "1.0.0",
                    "locale": locale  # Указываем предпочтительный язык
                }
            }
        }
        
        init_message = json.dumps(init_request) + "\n"
        logger.debug(f"Sending initialize request: {init_message.strip()}")
        process.stdin.write(init_message.encode('utf-8'))
        await process.stdin.drain()
        
        # Читаем ответ на initialize с увеличенным таймаутом
        try:
            init_response_line = await asyncio.wait_for(
                process.stdout.readline(), timeout=10.0
            )
            if not init_response_line:
                # Проверяем stderr на наличие ошибок
                stderr_output = b""
                if process.stderr:
                    try:
                        stderr_output = await asyncio.wait_for(process.stderr.read(), timeout=1.0)
                    except asyncio.TimeoutError:
                        pass
                error_msg = stderr_output.decode('utf-8', errors='ignore') if stderr_output else "No output"
                raise RuntimeError(f"No response from server. Stderr: {error_msg}")
        except asyncio.TimeoutError:
            # Проверяем stderr на наличие ошибок
            stderr_output = b""
            if process.stderr:
                try:
                    stderr_output = await asyncio.wait_for(process.stderr.read(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass
            error_msg = stderr_output.decode('utf-8', errors='ignore') if stderr_output else "Timeout waiting for response"
            raise RuntimeError(f"Timeout waiting for server response. Stderr: {error_msg}")
        
        logger.debug(f"Received initialize response: {init_response_line.decode('utf-8', errors='ignore')[:200]}")
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
        
        logger.debug(f"Sending tools/list request")
        process.stdin.write((json.dumps(tools_request) + "\n").encode('utf-8'))
        await process.stdin.drain()
        
        # Читаем ответ с увеличенным таймаутом
        try:
            tools_response_line = await asyncio.wait_for(
                process.stdout.readline(), timeout=10.0
            )
            if not tools_response_line:
                # Проверяем stderr на наличие ошибок
                stderr_output = b""
                if process.stderr:
                    try:
                        stderr_output = await asyncio.wait_for(process.stderr.read(), timeout=1.0)
                    except asyncio.TimeoutError:
                        pass
                error_msg = stderr_output.decode('utf-8', errors='ignore') if stderr_output else "No output"
                raise RuntimeError(f"No response to tools/list request. Stderr: {error_msg}")
        except asyncio.TimeoutError:
            # Проверяем stderr на наличие ошибок
            stderr_output = b""
            if process.stderr:
                try:
                    stderr_output = await asyncio.wait_for(process.stderr.read(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass
            error_msg = stderr_output.decode('utf-8', errors='ignore') if stderr_output else "Timeout waiting for response"
            raise RuntimeError(f"Timeout waiting for tools/list response. Stderr: {error_msg}")
        
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


async def _call_mcp_via_http(server_url: str, method: str, params: Dict[str, Any] = None, request_id: int = 1) -> Dict[str, Any]:
    """
    Вызов MCP метода через HTTP
    
    Args:
        server_url: URL MCP сервера
        method: Имя метода (например, "tools/list", "tools/call")
        params: Параметры метода
        request_id: ID запроса
    
    Returns:
        Результат вызова
    """
    try:
        jsonrpc_request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params or {}
        }
        
        logger.info(f"🌐 Calling MCP via HTTP: {server_url}, method: {method}, params: {params}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                server_url,
                json=jsonrpc_request,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            result = response.json()
            
            logger.debug(f"MCP HTTP response: {result}")
            
            if "error" in result:
                error_info = result["error"]
                error_msg = error_info.get("message", str(error_info))
                logger.error(f"MCP server error: {error_msg}")
                raise RuntimeError(f"MCP server error: {error_msg}")
            
            if "result" not in result:
                logger.warning(f"No 'result' field in MCP response: {result}")
                return {}
            
            return result.get("result", {})
            
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP status error calling MCP server {server_url}: {e.response.status_code} - {e.response.text}")
        raise RuntimeError(f"Failed to connect to MCP server: HTTP {e.response.status_code}")
    except httpx.HTTPError as e:
        logger.error(f"HTTP error calling MCP server {server_url}: {e}")
        raise RuntimeError(f"Failed to connect to MCP server: {e}")
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON response from MCP server: {e}")
        raise RuntimeError(f"Invalid JSON response from MCP server: {e}")
    except Exception as e:
        logger.error(f"Error calling MCP via HTTP: {e}")
        raise


async def list_mcp_tools(server_name: str, locale: str = "ru-RU") -> Dict[str, Any]:
    """
    Получение списка доступных инструментов от MCP сервера
    
    Args:
        server_name: Имя MCP сервера (команда, доступная в PATH) или "mcp-weather" для HTTP
        locale: Предпочтительный язык для ответов (например, "ru-RU", "en-US", "zh-CN")
    
    Returns:
        Словарь с информацией о сервере и инструментах
    """
    try:
        # Если это weather сервер и используется HTTP, подключаемся через HTTP
        if server_name == "mcp-weather" and MCP_USE_HTTP:
            logger.info(f"🌐 Using HTTP connection to list tools from {MCP_WEATHER_SERVER_URL}")
            try:
                # Для SSE сервера используем endpoint /messages/ для JSON-RPC запросов
                # Если URL не заканчивается на /messages/, добавляем его
                server_url = MCP_WEATHER_SERVER_URL
                if not server_url.endswith("/messages/") and not server_url.endswith("/messages"):
                    # Проверяем, есть ли уже путь в URL
                    if not any(part in server_url for part in ["/sse", "/messages", "/health"]):
                        server_url = f"{server_url.rstrip('/')}/messages/"
                    else:
                        # Если есть другой путь, заменяем на /messages/
                        parsed = urlparse(server_url)
                        server_url = urlunparse((parsed.scheme, parsed.netloc, "/messages/", "", "", ""))
                
                logger.info(f"🌐 Calling MCP Weather server at: {server_url}")
                result = await _call_mcp_via_http(
                    server_url,
                    "tools/list",
                    {},
                    request_id=1
                )
                server_info = {
                    "name": server_name,
                    "tools": result.get("tools", [])
                }
                return server_info
            except Exception as e:
                logger.error(f"Error listing tools via HTTP: {e}")
                return {
                    "name": server_name,
                    "error": str(e),
                    "tools": []
                }
        
        # Пробуем использовать официальный SDK, если доступен
        if MCP_AVAILABLE:
            try:
                return await _list_tools_with_sdk(server_name, locale)
            except FileNotFoundError:
                # Если SDK не нашел бинарник, пробуем fallback с npx
                logger.info(f"SDK didn't find binary for {server_name}, trying fallback with npx")
                return await _list_tools_with_fallback(server_name, locale)
        else:
            # Используем fallback реализацию
            logger.info(f"Using fallback MCP implementation for {server_name}")
            return await _list_tools_with_fallback(server_name, locale)
            
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
            f"2. Or use npx to run without installation: npx -y {npm_package if npm_package else '<package-name>'}\n"
            f"3. Or use the MCP server's installation instructions\n"
            f"4. Make sure the server binary is in your PATH\n\n"
            f"You can check if it's installed by running: which {server_name}\n"
            f"Or try running with npx: npx -y {npm_package if npm_package else '<package-name>'}"
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


async def _call_tool_with_fallback(server_name: str, tool_name: str, arguments: Dict[str, Any], locale: str = "ru-RU") -> Dict[str, Any]:
    """Fallback реализация для вызова инструмента MCP через JSON-RPC"""
    try:
        resolved_command = _resolve_mcp_server_command(server_name)
        resolved = None
        npx_args = None
        
        if resolved_command:
            if os.path.exists(resolved_command) or os.path.isfile(resolved_command.split()[0] if ' ' in resolved_command else resolved_command):
                resolved = resolved_command
            else:
                resolved = shutil.which(os.path.basename(resolved_command.split()[0] if ' ' in resolved_command else resolved_command)) or resolved_command
        
        if not resolved:
            npx_path = _find_npx()
            if npx_path:
                server_lower = server_name.lower()
                if "weather" in server_lower:
                    # Для weather сервера используем Python
                    python_path = shutil.which("python3") or shutil.which("python")
                    if python_path:
                        # Пробуем найти server.py
                        weather_paths = [
                            os.path.expanduser("~/MCP-Weather/server.py"),
                            os.path.expanduser("~/.local/share/mcp-weather/server.py"),
                        ]
                        for path in weather_paths:
                            if os.path.exists(path):
                                resolved = f"{python_path} {path}"
                                break
                else:
                    raise FileNotFoundError(f"MCP server '{server_name}' not found")
            else:
                raise FileNotFoundError(f"Neither MCP server '{server_name}' nor 'npx' found")
        
        # Подготавливаем переменные окружения
        env = dict(os.environ)
        if "python" in str(resolved).lower():
            env["PYTHONUNBUFFERED"] = "1"
        
        # Запускаем процесс
        if ' ' in resolved:
            # Команда с аргументами (например, "python3 /path/to/server.py")
            cmd_parts = resolved.split()
            process = await asyncio.create_subprocess_exec(
                *cmd_parts,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
        else:
            process = await asyncio.create_subprocess_exec(
                resolved,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
        
        if not process or not process.stdin or not process.stdout:
            raise RuntimeError("Failed to create subprocess pipes")
        
        await asyncio.sleep(0.5)
        
        if process.returncode is not None:
            stderr_output = b""
            if process.stderr:
                try:
                    stderr_output = await asyncio.wait_for(process.stderr.read(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass
            error_msg = stderr_output.decode('utf-8', errors='ignore') if stderr_output else "Unknown error"
            raise RuntimeError(f"MCP server process exited with code {process.returncode}: {error_msg}")
        
        # Инициализация
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "deepseek-web-client",
                    "version": "1.0.0",
                    "locale": locale
                }
            }
        }
        
        init_message = json.dumps(init_request) + "\n"
        process.stdin.write(init_message.encode('utf-8'))
        await process.stdin.drain()
        
        init_response_line = await asyncio.wait_for(process.stdout.readline(), timeout=10.0)
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
        
        # Вызываем инструмент
        call_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        
        process.stdin.write((json.dumps(call_request) + "\n").encode('utf-8'))
        await process.stdin.drain()
        
        # Читаем ответ
        call_response_line = await asyncio.wait_for(process.stdout.readline(), timeout=30.0)
        if not call_response_line:
            raise RuntimeError("No response to tool call")
        
        call_response = json.loads(call_response_line.decode('utf-8'))
        
        # Закрываем процесс
        process.stdin.close()
        await process.wait()
        
        if "error" in call_response:
            raise RuntimeError(f"MCP server error: {call_response['error']}")
        
        if "result" in call_response:
            return call_response["result"]
        else:
            raise RuntimeError(f"Unexpected response format: {call_response}")
            
    except FileNotFoundError:
        raise
    except asyncio.TimeoutError:
        raise RuntimeError("Timeout waiting for MCP server response")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON response from server: {e}")
    except Exception as e:
        raise RuntimeError(f"Error calling MCP tool: {e}")


async def call_mcp_tool(server_name: str, tool_name: str, arguments: Dict[str, Any], locale: str = "ru-RU") -> Dict[str, Any]:
    """
    Вызов инструмента MCP сервера
    
    Args:
        server_name: Имя MCP сервера или "mcp-weather" для HTTP
        tool_name: Имя инструмента для вызова
        arguments: Аргументы для инструмента
        locale: Предпочтительный язык для ответов
    
    Returns:
        Результат вызова инструмента
    """
    try:
        # Если это weather сервер и используется HTTP, подключаемся через HTTP
        if server_name == "mcp-weather" and MCP_USE_HTTP:
            logger.info(f"🌐 Using HTTP connection to call tool {tool_name} on {MCP_WEATHER_SERVER_URL}")
            try:
                # Для SSE сервера используем endpoint /messages/ для JSON-RPC запросов
                # Если URL не заканчивается на /messages/, добавляем его
                server_url = MCP_WEATHER_SERVER_URL
                if not server_url.endswith("/messages/") and not server_url.endswith("/messages"):
                    # Проверяем, есть ли уже путь в URL
                    if not any(part in server_url for part in ["/sse", "/messages", "/health"]):
                        server_url = f"{server_url.rstrip('/')}/messages/"
                    else:
                        # Если есть другой путь, заменяем на /messages/
                        parsed = urlparse(server_url)
                        server_url = urlunparse((parsed.scheme, parsed.netloc, "/messages/", "", "", ""))
                
                logger.info(f"🌐 Calling MCP Weather server at: {server_url}")
                result = await _call_mcp_via_http(
                    server_url,
                    "tools/call",
                    {
                        "name": tool_name,
                        "arguments": arguments
                    },
                    request_id=2
                )
                # Преобразуем результат в формат, ожидаемый кодом
                return {
                    "content": result.get("content", []),
                    "isError": result.get("isError", False)
                }
            except Exception as e:
                logger.error(f"Error calling tool via HTTP: {e}")
                raise
        
        if MCP_AVAILABLE:
            try:
                resolved_command = _resolve_mcp_server_command(server_name)
                if not resolved_command:
                    raise FileNotFoundError(f"MCP server '{server_name}' not found in PATH")
                
                # Если команда содержит пробелы (например, "python3 /path/to/server.py")
                if ' ' in resolved_command:
                    cmd_parts = resolved_command.split()
                    server_params = StdioServerParameters(
                        command=cmd_parts[0],
                        args=cmd_parts[1:],
                        env=None
                    )
                else:
                    server_params = StdioServerParameters(
                        command=resolved_command,
                        args=[],
                        env=None
                    )
                
                async with stdio_client(server_params) as (read, write):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        result = await session.call_tool(tool_name, arguments)
                        return {
                            "content": result.content if hasattr(result, 'content') else [],
                            "isError": getattr(result, 'isError', False)
                        }
            except FileNotFoundError:
                logger.info(f"SDK didn't find binary for {server_name}, trying fallback")
                return await _call_tool_with_fallback(server_name, tool_name, arguments, locale)
        else:
            logger.info(f"Using fallback MCP implementation for {server_name}")
            return await _call_tool_with_fallback(server_name, tool_name, arguments, locale)
            
    except FileNotFoundError as e:
        logger.error(f"MCP server '{server_name}' not found: {e}")
        raise
    except Exception as e:
        logger.error(f"Error calling MCP tool {tool_name} from server {server_name}: {str(e)}", exc_info=True)
        raise
