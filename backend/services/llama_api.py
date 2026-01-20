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
    # Для Llama 3.2 используем простой текстовый формат
    prompt_parts = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "system":
            prompt_parts.append(f"System: {content}\n\n")
        elif role == "user":
            prompt_parts.append(f"User: {content}\n\n")
        elif role == "assistant":
            prompt_parts.append(f"Assistant: {content}\n\n")
    
    # Для Llama 3.2 добавляем завершающий токен для начала ответа
    prompt = "".join(prompt_parts) + "Assistant:"
    
    logger.info(f"Llama prompt length: {len(prompt)}, preview: {prompt[:200]}...")
    
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
            data = response.json()
            logger.info(f"Llama API response type: {type(data)}, keys: {data.keys() if isinstance(data, dict) else 'list'}")
            logger.info(f"Llama API response preview: {str(data)[:500]}")
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
    
    # Формируем промпт из сообщений
    # Для Llama 3.2 используем простой текстовый формат
    prompt_parts = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "system":
            prompt_parts.append(f"System: {content}\n\n")
        elif role == "user":
            prompt_parts.append(f"User: {content}\n\n")
        elif role == "assistant":
            prompt_parts.append(f"Assistant: {content}\n\n")
    
    # Для Llama 3.2 добавляем завершающий токен для начала ответа
    prompt = "".join(prompt_parts) + "Assistant:"
    
    logger.info(f"Llama streaming prompt length: {len(prompt)}, preview: {prompt[:200]}...")
    
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
            logger.info(f"Llama streaming response type: {type(data)}, preview: {str(data)[:500]}")
            
            # Hugging Face API возвращает ответ в формате [{"generated_text": "..."}]
            generated_text = ""
            if isinstance(data, list) and len(data) > 0:
                generated_text = data[0].get("generated_text", "")
                logger.info(f"Extracted text from list format, length: {len(generated_text)}")
            elif isinstance(data, dict):
                # Проверяем разные возможные ключи
                if "generated_text" in data:
                    generated_text = data.get("generated_text", "")
                    logger.info(f"Extracted text from dict format (generated_text), length: {len(generated_text)}")
                elif "text" in data:
                    generated_text = data.get("text", "")
                    logger.info(f"Extracted text from dict format (text), length: {len(generated_text)}")
                elif len(data) == 1 and isinstance(list(data.values())[0], str):
                    # Если в словаре одно значение - строка
                    generated_text = list(data.values())[0]
                    logger.info(f"Extracted text from single-value dict, length: {len(generated_text)}")
            
            if generated_text:
                # Убираем префикс промпта, если он есть (return_full_text=False должен это делать, но на всякий случай)
                # Если generated_text начинается с нашего промпта, убираем его
                if generated_text.startswith(prompt):
                    generated_text = generated_text[len(prompt):].strip()
                elif prompt in generated_text:
                    # Если промпт где-то внутри, берем только часть после промпта
                    idx = generated_text.find(prompt)
                    if idx >= 0:
                        generated_text = generated_text[idx + len(prompt):].strip()
                
                # Убираем лишние пробелы и переносы строк в начале
                generated_text = generated_text.lstrip()
                
                logger.info(f"Final generated text length: {len(generated_text)}, preview: {generated_text[:200]}")
                
                if generated_text:
                    # Эмулируем streaming, отправляя текст по частям
                    chunk_size = 10
                    for i in range(0, len(generated_text), chunk_size):
                        chunk = generated_text[i:i + chunk_size]
                        yield json.dumps({"content": chunk})
                else:
                    logger.warning("Generated text is empty after processing")
                    yield json.dumps({"error": "Model returned empty response"})
            else:
                # Если формат неожиданный, пытаемся извлечь текст
                logger.warning(f"Unexpected response format, trying to extract text: {data}")
                text = str(data)
                yield json.dumps({"error": f"Unexpected response format: {text[:500]}"})
                
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error in Llama streaming: {str(e)}")
        error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
        yield json.dumps({"error": error_msg})
    except Exception as e:
        logger.error(f"Streaming error: {str(e)}")
        yield json.dumps({"error": str(e)})

