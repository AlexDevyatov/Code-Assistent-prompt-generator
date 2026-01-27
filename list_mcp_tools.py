#!/usr/bin/env python3
"""
Скрипт для вывода списка инструментов MCP сервера в удобном формате
"""
import sys
import json
import requests
from typing import Dict, Any

def print_tools_list(server_name: str = "mcp-server-google-search", base_url: str = "http://localhost:8000"):
    """Выводит список инструментов MCP сервера"""
    try:
        # Получаем полный список
        response = requests.get(f"{base_url}/api/mcp/list-tools/{server_name}")
        response.raise_for_status()
        data = response.json()
        
        # Проверяем на ошибки
        if "error" in data:
            print(f"❌ Ошибка: {data['error']}")
            return
        
        # Выводим информацию о сервере
        print(f"\n{'='*60}")
        print(f"📦 MCP Server: {data.get('name', 'Unknown')}")
        print(f"{'='*60}\n")
        
        tools = data.get("tools", [])
        if not tools:
            print("⚠️  Инструменты не найдены")
            return
        
        print(f"🔧 Доступно инструментов: {len(tools)}\n")
        
        # Выводим список инструментов
        for i, tool in enumerate(tools, 1):
            print(f"{i}. {tool.get('name', 'unknown')}")
            description = tool.get('description', '')
            if description:
                print(f"   Описание: {description[:100]}{'...' if len(description) > 100 else ''}")
            
            # Выводим параметры, если есть
            input_schema = tool.get('inputSchema', {})
            properties = input_schema.get('properties', {})
            required = input_schema.get('required', [])
            
            if properties:
                print(f"   Параметры:")
                for param_name, param_info in properties.items():
                    param_type = param_info.get('type', 'unknown')
                    param_desc = param_info.get('description', '')
                    is_required = param_name in required
                    req_mark = " (обязательный)" if is_required else " (опциональный)"
                    print(f"     - {param_name} ({param_type}){req_mark}")
                    if param_desc:
                        print(f"       {param_desc[:80]}")
            
            print()
        
        print(f"{'='*60}\n")
        
    except requests.exceptions.ConnectionError:
        print(f"❌ Ошибка: Не удалось подключиться к серверу {base_url}")
        print("   Убедитесь, что сервер запущен: npm run dev")
    except requests.exceptions.RequestException as e:
        print(f"❌ Ошибка запроса: {e}")
    except json.JSONDecodeError as e:
        print(f"❌ Ошибка парсинга JSON: {e}")
    except Exception as e:
        print(f"❌ Неожиданная ошибка: {e}")


if __name__ == "__main__":
    server_name = sys.argv[1] if len(sys.argv) > 1 else "mcp-server-google-search"
    print_tools_list(server_name)
