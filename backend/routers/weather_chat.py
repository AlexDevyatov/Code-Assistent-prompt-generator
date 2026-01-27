"""Роутер для обработки чата о погоде с использованием MCP сервера"""
import logging
import re
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.mcp_client import call_mcp_tool, list_mcp_tools
from backend.services.deepseek_api import call_deepseek_api

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/weather-chat", tags=["weather-chat"])

# Имя MCP сервера погоды
WEATHER_MCP_SERVER = "mcp-weather"


class WeatherChatRequest(BaseModel):
    prompt: str
    temperature: Optional[float] = 0.3
    max_tokens: Optional[int] = None


def _extract_weather_intent(prompt: str) -> Optional[Dict[str, Any]]:
    """
    Извлекает намерение пользователя из запроса о погоде
    
    Returns:
        Словарь с информацией о намерении или None
    """
    prompt_lower = prompt.lower()
    
    # Проверяем, есть ли запрос о погоде
    weather_keywords = ["погода", "weather", "температура", "temperature", "дождь", "rain", 
                       "снег", "snow", "ветер", "wind", "прогноз", "forecast"]
    
    if not any(keyword in prompt_lower for keyword in weather_keywords):
        return None
    
    intent = {
        "type": None,
        "location": None,
        "days": 3
    }
    
    # Определяем тип запроса
    if any(word in prompt_lower for word in ["прогноз", "forecast", "на несколько дней", "на неделю"]):
        intent["type"] = "forecast"
        # Извлекаем количество дней
        days_match = re.search(r'(\d+)\s*(?:дн|day|день|дня|дней)', prompt_lower)
        if days_match:
            intent["days"] = min(int(days_match.group(1)), 7)
    else:
        intent["type"] = "current"
    
    # Извлекаем местоположение
    # Убираем ключевые слова и ищем названия городов
    location_patterns = [
        r'в\s+([А-ЯЁа-яёA-Za-z\s]+?)(?:\s|$|,|\.)',
        r'для\s+([А-ЯЁа-яёA-Za-z\s]+?)(?:\s|$|,|\.)',
        r'([А-ЯЁа-яёA-Z][а-яё]+)\s+(?:погода|weather)',
    ]
    
    for pattern in location_patterns:
        match = re.search(pattern, prompt_lower)
        if match:
            location = match.group(1).strip()
            # Фильтруем общие слова
            if location and len(location) > 2 and location not in ["какая", "какой", "какое", "the", "a"]:
                intent["location"] = location
                break
    
    # Если местоположение не найдено, пробуем найти название города в начале или конце
    if not intent["location"]:
        words = prompt.split()
        # Берем первое слово с заглавной буквы как возможное название города
        for word in words:
            if word and word[0].isupper() and len(word) > 2:
                # Проверяем, что это не ключевое слово
                if word.lower() not in ["погода", "weather", "прогноз", "forecast", "температура", "temperature"]:
                    intent["location"] = word
                    break
    
    return intent


async def _get_weather_data(intent: Dict[str, Any]) -> Optional[str]:
    """
    Получает данные о погоде через MCP сервер
    
    Args:
        intent: Информация о намерении пользователя
    
    Returns:
        Строка с данными о погоде или None в случае ошибки
    """
    try:
        # Сначала проверяем доступность сервера
        server_info = await list_mcp_tools(WEATHER_MCP_SERVER)
        if "error" in server_info:
            logger.error(f"MCP Weather server error: {server_info['error']}")
            return None
        
        # Определяем аргументы для вызова инструмента
        tool_name = None
        arguments = {}
        
        if intent["type"] == "forecast":
            tool_name = "get_weather_forecast"
            arguments["days"] = intent["days"]
        else:
            tool_name = "get_current_weather"
        
        if intent["location"]:
            arguments["location"] = intent["location"]
        
        # Вызываем инструмент
        logger.info(f"Calling MCP tool {tool_name} with arguments: {arguments}")
        result = await call_mcp_tool(WEATHER_MCP_SERVER, tool_name, arguments)
        
        # Обрабатываем результат
        if result.get("isError"):
            logger.error(f"MCP tool returned error: {result}")
            return None
        
        # Извлекаем текст из результата
        content = result.get("content", [])
        if isinstance(content, list) and len(content) > 0:
            # MCP возвращает список объектов с полем "text"
            text_parts = []
            for item in content:
                if isinstance(item, dict) and "text" in item:
                    text_parts.append(item["text"])
                elif isinstance(item, str):
                    text_parts.append(item)
            
            if text_parts:
                return "\n\n".join(text_parts)
        
        # Если формат неожиданный, возвращаем как есть
        return str(result) if result else None
        
    except Exception as e:
        logger.error(f"Error getting weather data: {str(e)}", exc_info=True)
        return None


@router.post("")
async def weather_chat(request: WeatherChatRequest):
    """
    Обработка запросов о погоде с использованием MCP сервера
    
    Args:
        request: Запрос пользователя
    
    Returns:
        Ответ с информацией о погоде
    """
    try:
        logger.info(f"Received weather chat request: {request.prompt[:100]}...")
        
        # Извлекаем намерение пользователя
        intent = _extract_weather_intent(request.prompt)
        
        if not intent:
            # Если это не запрос о погоде, отвечаем обычным способом
            messages = [
                {"role": "system", "content": "Ты помощник, который помогает с вопросами о погоде. Если пользователь спрашивает о погоде, используй доступные инструменты для получения актуальной информации."},
                {"role": "user", "content": request.prompt}
            ]
            
            data = await call_deepseek_api(messages, temperature=request.temperature, max_tokens=request.max_tokens)
            if "choices" in data and len(data["choices"]) > 0:
                return {"response": data["choices"][0]["message"]["content"]}
            else:
                raise HTTPException(status_code=500, detail="Unexpected response format from DeepSeek API")
        
        # Получаем данные о погоде через MCP
        weather_data = await _get_weather_data(intent)
        
        if weather_data:
            # Если получили данные о погоде, формируем ответ
            response = f"Вот информация о погоде:\n\n{weather_data}"
            
            # Если пользователь задал вопрос, можем дополнить ответ через DeepSeek
            if "?" in request.prompt or any(word in request.prompt.lower() for word in ["что", "как", "почему", "расскажи", "объясни"]):
                messages = [
                    {"role": "system", "content": "Ты помощник, который помогает с вопросами о погоде. Отвечай кратко и по делу."},
                    {"role": "user", "content": f"Вопрос: {request.prompt}\n\nДанные о погоде:\n{weather_data}\n\nОтветь на вопрос пользователя, используя предоставленные данные о погоде."}
                ]
                
                data = await call_deepseek_api(messages, temperature=request.temperature, max_tokens=request.max_tokens)
                if "choices" in data and len(data["choices"]) > 0:
                    response = data["choices"][0]["message"]["content"]
            
            return {"response": response}
        else:
            # Если не удалось получить данные о погоде, отвечаем через DeepSeek
            messages = [
                {"role": "system", "content": "Ты помощник, который помогает с вопросами о погоде. Если не удалось получить данные о погоде, извинись и предложи уточнить запрос."},
                {"role": "user", "content": request.prompt}
            ]
            
            data = await call_deepseek_api(messages, temperature=request.temperature, max_tokens=request.max_tokens)
            if "choices" in data and len(data["choices"]) > 0:
                return {"response": data["choices"][0]["message"]["content"]}
            else:
                raise HTTPException(status_code=500, detail="Unexpected response format from DeepSeek API")
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in weather chat: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
