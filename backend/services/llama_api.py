"""Сервис для работы с Hugging Face Inference API (Llama 3.2-1B)"""
import json
import logging
from typing import List, Dict, Optional, AsyncGenerator
import httpx

from backend.config import HUGGINGFACE_API_KEY, HUGGINGFACE_API_URL

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
    
    # Формируем промпт из сообщений
    # Hugging Face API принимает простой текстовый промпт
    prompt_parts = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "system":
            prompt_parts.append(f"System: {content}\n")
        elif role == "user":
            prompt_parts.append(f"User: {content}\n")
        elif role == "assistant":
            prompt_parts.append(f"Assistant: {content}\n")
    
    prompt = "".join(prompt_parts) + "Assistant:"
    
    headers = {
        "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "inputs": prompt,
        "parameters": {
            "temperature": temperature,
            "max_new_tokens": max_tokens or 1000,
            "return_full_text": False
        }
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
            return response.json()
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
    
    # Формируем промпт из сообщений
    prompt_parts = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "system":
            prompt_parts.append(f"System: {content}\n")
        elif role == "user":
            prompt_parts.append(f"User: {content}\n")
        elif role == "assistant":
            prompt_parts.append(f"Assistant: {content}\n")
    
    prompt = "".join(prompt_parts) + "Assistant:"
    
    headers = {
        "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "inputs": prompt,
        "parameters": {
            "temperature": temperature,
            "max_new_tokens": max_tokens or 1000,
            "return_full_text": False
        },
        "options": {
            "wait_for_model": True
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                HUGGINGFACE_API_URL,
                headers=headers,
                json=payload
            )
            
            # Проверяем статус ответа
            if response.status_code == 503:
                # Модель еще загружается
                error_data = response.json()
                error_msg = error_data.get("error", "Model is loading, please try again in a few moments")
                yield json.dumps({"error": f"Model is loading: {error_msg}"})
                return
            
            response.raise_for_status()
            
            data = response.json()
            
            # Hugging Face API возвращает ответ в формате [{"generated_text": "..."}]
            if isinstance(data, list) and len(data) > 0:
                generated_text = data[0].get("generated_text", "")
                # Эмулируем streaming, отправляя текст по частям
                chunk_size = 10
                for i in range(0, len(generated_text), chunk_size):
                    chunk = generated_text[i:i + chunk_size]
                    yield json.dumps({"content": chunk})
            elif isinstance(data, dict) and "generated_text" in data:
                # Альтернативный формат ответа
                generated_text = data.get("generated_text", "")
                chunk_size = 10
                for i in range(0, len(generated_text), chunk_size):
                    chunk = generated_text[i:i + chunk_size]
                    yield json.dumps({"content": chunk})
            else:
                # Если формат неожиданный, пытаемся извлечь текст
                text = str(data)
                yield json.dumps({"content": text})
                
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error in Llama streaming: {str(e)}")
        error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
        yield json.dumps({"error": error_msg})
    except Exception as e:
        logger.error(f"Streaming error: {str(e)}")
        yield json.dumps({"error": str(e)})

