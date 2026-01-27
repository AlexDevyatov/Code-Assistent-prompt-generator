"""Тесты для проверки, что запросы о погоде проходят через MCP"""
import pytest
import sys
from unittest.mock import AsyncMock, patch, MagicMock
from pathlib import Path

# Настройка pytest-asyncio
pytest_plugins = ('pytest_asyncio',)

# Добавляем корневую директорию проекта в путь
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.routers.weather_chat import weather_chat, _get_weather_data
from backend.routers.weather_chat import WeatherChatRequest


class TestWeatherChatMCP:
    """Тесты для проверки использования MCP сервера"""
    
    @pytest.mark.asyncio
    async def test_weather_request_calls_mcp(self):
        """Тест: запрос о погоде должен вызывать MCP сервер"""
        request = WeatherChatRequest(prompt="погода в Москве")
        
        # Мокируем MCP вызовы
        mock_weather_data = "🌤️ Погода в Москве\nТемпература: 15°C\nУсловия: облачно"
        
        with patch('backend.routers.weather_chat.list_mcp_tools') as mock_list_tools, \
             patch('backend.routers.weather_chat.call_mcp_tool') as mock_call_tool:
            
            # Настраиваем моки
            mock_list_tools.return_value = {
                "name": "mcp-weather",
                "tools": [
                    {"name": "get_current_weather", "description": "Get current weather"}
                ]
            }
            
            mock_call_tool.return_value = {
                "content": [{"text": mock_weather_data}],
                "isError": False
            }
            
            # Вызываем функцию
            result = await weather_chat(request)
            
            # Проверяем, что MCP был вызван
            assert mock_list_tools.called, "list_mcp_tools должен быть вызван"
            assert mock_call_tool.called, "call_mcp_tool должен быть вызван"
            
            # Проверяем параметры вызова
            call_args = mock_call_tool.call_args
            assert call_args[0][0] == "mcp-weather", "Должен вызываться mcp-weather сервер"
            assert call_args[0][1] == "get_current_weather", "Должен вызываться get_current_weather"
            assert "location" in call_args[0][2], "Должен передаваться location"
            assert call_args[0][2]["location"] == "Москве", "Location должен быть 'Москве'"
            
            # Проверяем, что ответ содержит данные от MCP
            assert "погода" in result["response"].lower() or "weather" in result["response"].lower()
            assert "Москве" in result["response"] or "Москва" in result["response"]
    
    @pytest.mark.asyncio
    async def test_forecast_request_calls_mcp(self):
        """Тест: запрос прогноза должен вызывать MCP с правильными параметрами"""
        request = WeatherChatRequest(prompt="прогноз погоды в Москве на 5 дней")
        
        mock_forecast_data = "📅 Прогноз погоды в Москве на 5 дней\nДень 1: 15°C\nДень 2: 16°C"
        
        with patch('backend.routers.weather_chat.list_mcp_tools') as mock_list_tools, \
             patch('backend.routers.weather_chat.call_mcp_tool') as mock_call_tool:
            
            mock_list_tools.return_value = {
                "name": "mcp-weather",
                "tools": [{"name": "get_weather_forecast", "description": "Get weather forecast"}]
            }
            
            mock_call_tool.return_value = {
                "content": [{"text": mock_forecast_data}],
                "isError": False
            }
            
            result = await weather_chat(request)
            
            # Проверяем, что вызван правильный инструмент
            call_args = mock_call_tool.call_args
            assert call_args[0][1] == "get_weather_forecast", "Должен вызываться get_weather_forecast"
            assert call_args[0][2]["days"] == 5, "Должно быть указано 5 дней"
            assert call_args[0][2]["location"] == "Москве", "Location должен быть 'Москве'"
    
    @pytest.mark.asyncio
    async def test_non_weather_request_does_not_call_mcp(self):
        """Тест: запрос не о погоде НЕ должен вызывать MCP"""
        request = WeatherChatRequest(prompt="как дела?")
        
        with patch('backend.routers.weather_chat.list_mcp_tools') as mock_list_tools, \
             patch('backend.routers.weather_chat.call_mcp_tool') as mock_call_tool, \
             patch('backend.routers.weather_chat.call_deepseek_api') as mock_deepseek:
            
            mock_deepseek.return_value = {
                "choices": [{"message": {"content": "У меня все хорошо!"}}]
            }
            
            result = await weather_chat(request)
            
            # Проверяем, что MCP НЕ был вызван
            assert not mock_list_tools.called, "list_mcp_tools НЕ должен быть вызван для не-погодных запросов"
            assert not mock_call_tool.called, "call_mcp_tool НЕ должен быть вызван для не-погодных запросов"
            
            # Проверяем, что использован DeepSeek API
            assert mock_deepseek.called, "call_deepseek_api должен быть вызван"
    
    @pytest.mark.asyncio
    async def test_mcp_error_fallback_to_deepseek(self):
        """Тест: при ошибке MCP должен быть fallback на DeepSeek"""
        request = WeatherChatRequest(prompt="погода в Москве")
        
        with patch('backend.routers.weather_chat.list_mcp_tools') as mock_list_tools, \
             patch('backend.routers.weather_chat.call_mcp_tool') as mock_call_tool, \
             patch('backend.routers.weather_chat.call_deepseek_api') as mock_deepseek:
            
            # MCP возвращает ошибку
            mock_list_tools.return_value = {
                "name": "mcp-weather",
                "error": "Server not found"
            }
            
            mock_deepseek.return_value = {
                "choices": [{"message": {"content": "Извините, не удалось получить данные о погоде."}}]
            }
            
            result = await weather_chat(request)
            
            # Проверяем, что MCP был вызван (но вернул ошибку)
            assert mock_list_tools.called, "list_mcp_tools должен быть вызван"
            
            # Проверяем, что использован fallback на DeepSeek
            assert mock_deepseek.called, "call_deepseek_api должен быть вызван как fallback"
    
    @pytest.mark.asyncio
    async def test_get_weather_data_calls_mcp(self):
        """Тест: функция _get_weather_data должна вызывать MCP"""
        intent = {
            "type": "current",
            "location": "Москве",
            "days": 3
        }
        
        with patch('backend.routers.weather_chat.list_mcp_tools') as mock_list_tools, \
             patch('backend.routers.weather_chat.call_mcp_tool') as mock_call_tool:
            
            mock_list_tools.return_value = {
                "name": "mcp-weather",
                "tools": [{"name": "get_current_weather"}]
            }
            
            mock_call_tool.return_value = {
                "content": [{"text": "Погода в Москве: 15°C"}],
                "isError": False
            }
            
            result = await _get_weather_data(intent)
            
            # Проверяем вызовы MCP
            assert mock_list_tools.called, "list_mcp_tools должен быть вызван"
            assert mock_call_tool.called, "call_mcp_tool должен быть вызван"
            
            # Проверяем параметры
            call_args = mock_call_tool.call_args
            assert call_args[0][0] == "mcp-weather"
            assert call_args[0][1] == "get_current_weather"
            assert call_args[0][2]["location"] == "Москве"
            
            # Проверяем результат
            assert result is not None
            assert "Погода" in result or "погода" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
