"""Сервис для работы с Hugging Face Inference API (Llama 3.2-1B)"""
import json
import logging
from typing import List, Dict, Optional, AsyncGenerator
import httpx

from backend.config import HUGGINGFACE_API_KEY, HUGGINGFACE_API_URL, HUGGINGFACE_MODEL

logger = logging.getLogger(__name__)


async def call_llama_api(
    messages: List[Dict[str, str]],
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
) -> Dict:
    """
    Вызов Hugging Face Inference API для получения ответа от Llama 3.2-1B
    
    Args:
        messages: Список сообщений в формате [{"role": "user/assistant/system", "content": "..."}]
        temperature: Температура для генерации (по умолчанию 0.7)
        max_tokens: Максимальное количество токенов
    
    Returns:
        Dict с ответом от API
    """
    if not HUGGINGFACE_API_KEY:
        raise ValueError("HUGGINGFACE_API_KEY not found in environment variables")
    
    # Новый Hugging Face API использует формат chat completions (OpenAI-подобный)
    # Преобразуем messages в формат для нового API
    logger.info(f"Llama request: {len(messages)} messages, temperature={temperature}, max_tokens={max_tokens}")
    
    headers = {
        "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # Новый API использует формат chat completions
    payload = {
        "model": HUGGINGFACE_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens or 1000
    }
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                HUGGINGFACE_API_URL,
                headers=headers,
                json=payload
            )
            
            # Проверяем статус ответа
            if response.status_code == 503:
                # Модель еще загружается
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", "Model is loading, please try again in a few moments")
                except:
                    error_msg = "Model is loading, please try again in a few moments"
                raise ValueError(f"Model is loading: {error_msg}")
            
            response.raise_for_status()
            data = response.json()
            logger.info(f"Llama API response type: {type(data)}, keys: {data.keys() if isinstance(data, dict) else 'list'}")
            logger.info(f"Llama API response preview: {str(data)[:500]}")
            
            # Новый API возвращает ответ в формате OpenAI: {"choices": [{"message": {"content": "..."}}]}
            if isinstance(data, dict) and "choices" in data and len(data["choices"]) > 0:
                # Преобразуем в старый формат для совместимости
                content = data["choices"][0].get("message", {}).get("content", "")
                return [{"generated_text": content}]
            
            return data
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error in Llama API: {str(e)}")
        raise ValueError(f"HTTP {e.response.status_code}: {e.response.text[:200]}")
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Error in Llama API: {str(e)}")
        raise ValueError(f"Error calling Llama API: {str(e)}")


async def stream_llama_api(
    messages: List[Dict[str, str]],
    temperature: float = 0.7,
    max_tokens: Optional[int] = None
) -> AsyncGenerator[str, None]:
    """
    Streaming вызов Hugging Face Inference API для получения ответа по частям
    
    Args:
        messages: Список сообщений в формате [{"role": "user/assistant/system", "content": "..."}]
        temperature: Температура для генерации (по умолчанию 0.7)
        max_tokens: Максимальное количество токенов
    
    Yields:
        JSON строки с частями ответа в формате {"content": "..."} или {"error": "..."}
    """
    if not HUGGINGFACE_API_KEY:
        yield json.dumps({"error": "HUGGINGFACE_API_KEY not found in environment variables"})
        return
    
    # Новый Hugging Face API использует формат chat completions (OpenAI-подобный)
    logger.info(f"Llama streaming request: {len(messages)} messages, temperature={temperature}, max_tokens={max_tokens}")
    
    headers = {
        "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # Новый API использует формат chat completions с поддержкой streaming
    payload = {
        "model": HUGGINGFACE_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens or 1000,
        "stream": True
    }
    
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            async with client.stream(
                "POST",
                HUGGINGFACE_API_URL,
                headers=headers,
                json=payload
            ) as response:
                # Проверяем статус ответа
                if response.status_code == 503:
                    # Модель еще загружается
                    error_text = await response.aread()
                    try:
                        error_data = json.loads(error_text)
                        error_msg = error_data.get("error", "Model is loading, please try again in a few moments")
                    except:
                        error_msg = "Model is loading, please try again in a few moments"
                    yield json.dumps({"error": f"Model is loading: {error_msg}"})
                    return
                
                response.raise_for_status()
                
                # Новый API поддерживает streaming в формате Server-Sent Events (SSE)
                # Аналогично OpenAI API
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    
                    if line.startswith("data: "):
                        data_str = line[6:]  # Убираем "data: "
                        if data_str == "[DONE]":
                            break
                        
                        try:
                            data = json.loads(data_str)
                            # Формат: {"choices": [{"delta": {"content": "..."}}]}
                            if "choices" in data and len(data["choices"]) > 0:
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield json.dumps({"content": content})
                        except json.JSONDecodeError:
                            logger.warning(f"Failed to parse SSE line: {line[:100]}")
                            continue
                        except Exception as e:
                            logger.error(f"Error processing SSE line: {e}")
                            continue
                
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error in Llama streaming: {str(e)}")
        error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
        yield json.dumps({"error": error_msg})
    except Exception as e:
        logger.error(f"Streaming error: {str(e)}")
        yield json.dumps({"error": str(e)})

