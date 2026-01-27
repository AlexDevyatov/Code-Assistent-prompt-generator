"""Роутер для обработки чата о погоде с использованием MCP сервера"""
import logging
import re
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.mcp_client import call_mcp_tool, list_mcp_tools, _call_mcp_via_http
from backend.services.deepseek_api import call_deepseek_api
from backend.config import MCP_WEATHER_SERVER_URL, MCP_USE_HTTP

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
    
    # Расширенный список ключевых слов для определения запросов о погоде
    weather_keywords = [
        "погода", "weather", "температура", "temperature", "temp", 
        "дождь", "rain", "дожд", "raining", "rainy",
        "снег", "snow", "снеж", "snowing", "snowy",
        "ветер", "wind", "ветр", "windy",
        "прогноз", "forecast", "прогноз погоды", "weather forecast",
        "облачно", "cloudy", "облака", "clouds",
        "солнечно", "sunny", "солнце", "sun",
        "туман", "fog", "туманно", "foggy",
        "град", "hail", "гроза", "thunderstorm",
        "влажность", "humidity", "давление", "pressure",
        "осадки", "precipitation", "осадк",
        "климат", "climate", "метео", "meteo"
    ]
    
    # Проверяем, есть ли запрос о погоде
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
    # Упрощенная и более надежная логика извлечения
    # Список слов для исключения
    exclude_words = [
        "какая", "какой", "какое", "какие", "the", "a", "an", "в", "для", "for",
        "на", "по", "с", "о", "об", "про", "как", "что", "где", "когда",
        "расскажи", "скажи", "покажи", "tell", "show", "say", "погода", "weather"
    ]
    
    # Метод 1: Ищем паттерн "в [название города]" - самый частый случай
    # Ищем "в" или "in", затем слова до конца строки или знака препинания
    # Берем до 3 слов (для названий типа "Санкт-Петербург", "Нью-Йорк")
    pattern_v = r'\b(?:в|in)\s+((?:[А-ЯЁа-яёA-Za-z][А-ЯЁа-яёA-Za-z\-]*\s*){1,3})(?:\s|$|,|\.|\?|!|;|:)'
    match = re.search(pattern_v, prompt, re.IGNORECASE)
    if match:
        location = match.group(1).strip().rstrip('.,!?;:()[]{}"\'')
        location_words = location.split()
        # Фильтруем стоп-слова из начала
        filtered_words = []
        for word in location_words:
            word_clean = word.strip('.,!?;:()[]{}"\'')
            if word_clean.lower() not in exclude_words:
                filtered_words.append(word_clean)
            else:
                break  # Если встретили стоп-слово, останавливаемся
        
        if filtered_words:
            location = ' '.join(filtered_words)
            location_lower = location.lower()
            # Проверяем, что это не исключенное слово и имеет достаточную длину
            if (location and len(location) > 2 and 
                location_lower not in exclude_words):
                # Приводим к правильному регистру (каждое слово с заглавной буквы)
                location = ' '.join(word.capitalize() for word in location.split())
                intent["location"] = location
                logger.info(f"Extracted location (method 1 - 'в'): {location} from prompt: {prompt}")
    
    # Метод 2: Если не нашли через "в", ищем паттерн "[название города] погода"
    if not intent["location"]:
        pattern_city_first = r'([А-ЯЁа-яёA-Za-z][А-ЯЁа-яёA-Za-z\s\-]+?)\s+(?:погода|weather|прогноз|forecast)'
        match = re.search(pattern_city_first, prompt, re.IGNORECASE)
        if match:
            location = match.group(1).strip().rstrip('.,!?;:()[]{}"\'')
            location_lower = location.lower()
            if (location and len(location) > 2 and 
                location_lower not in exclude_words):
                # Приводим к правильному регистру
                if location[0].islower():
                    location = location[0].upper() + location[1:]
                intent["location"] = location
                logger.info(f"Extracted location (method 2 - city first): {location} from prompt: {prompt}")
    
    # Метод 3: Ищем слова с заглавной буквы в тексте (резервный метод)
    if not intent["location"]:
        words = prompt.split()
        for word in words:
            clean_word = word.strip('.,!?;:()[]{}"\'')
            if (clean_word and clean_word[0].isupper() and len(clean_word) > 2 and
                clean_word.lower() not in weather_keywords + exclude_words):
                intent["location"] = clean_word
                logger.info(f"Extracted location (method 3 - capitalized): {clean_word} from prompt: {prompt}")
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
        # Определяем аргументы для вызова инструмента
        tool_name = None
        arguments = {}
        
        if intent["type"] == "forecast":
            tool_name = "get_weather_forecast"
            arguments["days"] = intent["days"]
        else:
            tool_name = "get_current_weather"
        
        # Всегда передаем location, даже если оно не указано (MCP сервер может использовать дефолтное)
        if intent["location"]:
            arguments["location"] = intent["location"]
        # Если местоположение не указано, MCP сервер может использовать дефолтное или вернуть ошибку
        
        # Вызываем инструмент MCP - это обязательно для запросов о погоде
        logger.info(f"Calling MCP tool {tool_name} with arguments: {arguments}")
        
        # Используем HTTP подключение, если настроено
        if MCP_USE_HTTP:
            logger.info(f"🌐 Using HTTP connection to MCP server: {MCP_WEATHER_SERVER_URL}")
            result = await call_mcp_tool(WEATHER_MCP_SERVER, tool_name, arguments)
        else:
            # Используем локальное подключение через stdio
            logger.info(f"🔧 Using local stdio connection to MCP server: {WEATHER_MCP_SERVER}")
            server_info = await list_mcp_tools(WEATHER_MCP_SERVER)
            if "error" in server_info:
                logger.error(f"MCP Weather server error: {server_info['error']}")
                return None
            
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
        logger.info(f"Extracted intent: {intent}")
        
        if not intent:
            # Если это не запрос о погоде, отвечаем обычным способом
            logger.info("ℹ️ No weather intent detected, using DeepSeek API directly (MCP will NOT be called)")
            messages = [
                {"role": "system", "content": "Ты универсальный AI-помощник. Отвечай на любые вопросы пользователя. Если пользователь спрашивает о погоде, используй доступные инструменты для получения актуальной информации."},
                {"role": "user", "content": request.prompt}
            ]
            
            data = await call_deepseek_api(messages, temperature=request.temperature, max_tokens=request.max_tokens)
            if "choices" in data and len(data["choices"]) > 0:
                return {"response": data["choices"][0]["message"]["content"]}
            else:
                raise HTTPException(status_code=500, detail="Unexpected response format from DeepSeek API")
        
        # Получаем данные о погоде через MCP (обязательно для запросов о погоде)
        logger.info(f"🌤️ Weather intent detected: {intent}, calling MCP server '{WEATHER_MCP_SERVER}'")
        logger.info(f"🔧 MCP will be called with tool based on intent type: {intent['type']}")
        weather_data = await _get_weather_data(intent)
        if weather_data:
            logger.info(f"✅ MCP server returned weather data successfully (length: {len(weather_data)} chars)")
        else:
            logger.warning(f"⚠️ MCP server did not return weather data, will use DeepSeek fallback")
        
        if weather_data:
            # Если получили данные о погоде, формируем ответ
            response = f"Вот информация о погоде:\n\n{weather_data}"
            
            # Если пользователь задал вопрос, можем дополнить ответ через DeepSeek
            if "?" in request.prompt or any(word in request.prompt.lower() for word in ["что", "как", "почему", "расскажи", "объясни"]):
                messages = [
                    {"role": "system", "content": "Ты универсальный AI-помощник. Отвечай кратко и по делу, используя предоставленные данные."},
                    {"role": "user", "content": f"Вопрос: {request.prompt}\n\nДанные о погоде:\n{weather_data}\n\nОтветь на вопрос пользователя, используя предоставленные данные о погоде."}
                ]
                
                data = await call_deepseek_api(messages, temperature=request.temperature, max_tokens=request.max_tokens)
                if "choices" in data and len(data["choices"]) > 0:
                    response = data["choices"][0]["message"]["content"]
            
            return {"response": response}
        else:
            # Если не удалось получить данные о погоде, отвечаем через DeepSeek
            messages = [
                {"role": "system", "content": "Ты универсальный AI-помощник. Если не удалось получить данные о погоде через инструменты, извинись и предложи уточнить запрос или ответь на основе общих знаний."},
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
