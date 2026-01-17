"""Сервис для работы с DeepSeek API"""
import json
import logging
from typing import List, Dict, Optional, AsyncGenerator
import httpx

from backend.config import DEEPSEEK_API_URL, API_KEY, MAX_TOKENS

logger = logging.getLogger(__name__)


async def call_deepseek_api(
    messages: List[Dict[str, str]],
    temperature: float = 0.3,
    max_tokens: Optional[int] = None,
    stream: bool = False
) -> Dict:
    """
    Вызов DeepSeek API для получения ответа
    
    Args:
        messages: Список сообщений в формате [{"role": "user/assistant/system", "content": "..."}]
        temperature: Температура для генерации (по умолчанию 0.3)
        max_tokens: Максимальное количество токенов (по умолчанию из конфига)
        stream: Использовать ли streaming (по умолчанию False)
    
    Returns:
        Dict с ответом от API
    """
    if not API_KEY:
        raise ValueError("API key is not configured")
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens or MAX_TOKENS,
        "stream": stream
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            DEEPSEEK_API_URL,
            headers=headers,
            json=payload
        )
        response.raise_for_status()
        return response.json()


async def stream_deepseek_api(
    messages: List[Dict[str, str]],
    temperature: float = 0.3,
    max_tokens: Optional[int] = None
) -> AsyncGenerator[str, None]:
    """
    Streaming вызов DeepSeek API для получения ответа по частям
    
    Args:
        messages: Список сообщений в формате [{"role": "user/assistant/system", "content": "..."}]
        temperature: Температура для генерации (по умолчанию 0.3)
        max_tokens: Максимальное количество токенов (по умолчанию из конфига)
    
    Yields:
        JSON строки с частями ответа в формате {"content": "..."} или {"error": "..."}
    """
    if not API_KEY:
        yield json.dumps({"error": "API key is not configured"})
        return
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens or MAX_TOKENS,
        "stream": True
    }
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                DEEPSEEK_API_URL,
                headers=headers,
                json=payload
            ) as response:
                response.raise_for_status()
                
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]  # Убираем "data: "
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if "choices" in data and len(data["choices"]) > 0:
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield json.dumps({"content": content})
                        except json.JSONDecodeError:
                            continue
    except Exception as e:
        logger.error(f"Streaming error: {str(e)}")
        yield json.dumps({"error": str(e)})

