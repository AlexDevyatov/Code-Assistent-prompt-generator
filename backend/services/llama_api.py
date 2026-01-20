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
    
    # Проверяем, что используется правильный URL (не старый api-inference)
    if "api-inference.huggingface.co" in HUGGINGFACE_API_URL:
        error_msg = f"ERROR: Old API URL detected! Please update HUGGINGFACE_API_URL in config.py. Current: {HUGGINGFACE_API_URL}"
        logger.error(error_msg)
        raise ValueError("Configuration error: Old API URL detected. Please restart the server after updating the configuration.")
    
    logger.info(f"Llama API request URL: {HUGGINGFACE_API_URL}")
    logger.info(f"Llama API request payload: {json.dumps(payload, indent=2)}")
    
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
    except httpx.TimeoutException as e:
        logger.error(f"Timeout error in Llama API: {str(e)}")
        raise ValueError(f"Request timeout: The API did not respond in time. Please try again.")
    except httpx.NetworkError as e:
        logger.error(f"Network error in Llama API: {str(e)}")
        raise ValueError(f"Network error: Unable to connect to Hugging Face API. Please check your internet connection.")
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error in Llama API: {str(e)}")
        try:
            if e.response:
                error_text = e.response.text[:1000] if e.response.text else "No error message"
                logger.error(f"Error response body: {error_text}")
                try:
                    error_json = e.response.json()
                    logger.error(f"Error response JSON: {json.dumps(error_json, indent=2)}")
                except:
                    pass
        except Exception as ex:
            logger.error(f"Failed to read error response: {ex}")
        try:
            error_text = e.response.text[:500] if e.response and e.response.text else "Unknown error"
        except:
            error_text = f"HTTP {e.response.status_code}" if e.response else "Unknown error"
        raise ValueError(f"HTTP {e.response.status_code if e.response else 'unknown'}: {error_text}")
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in Llama API: {str(e)}", exc_info=True)
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
    
    # Проверяем, что используется правильный URL (не старый api-inference)
    if "api-inference.huggingface.co" in HUGGINGFACE_API_URL:
        error_msg = f"ERROR: Old API URL detected! Please update HUGGINGFACE_API_URL in config.py. Current: {HUGGINGFACE_API_URL}"
        logger.error(error_msg)
        yield json.dumps({"error": "Configuration error: Old API URL detected. Please restart the server after updating the configuration."})
        return
    
    logger.info(f"Llama streaming API request URL: {HUGGINGFACE_API_URL}")
    logger.info(f"Llama streaming API request payload: {json.dumps(payload, indent=2)}")
    
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            async with client.stream(
                "POST",
                HUGGINGFACE_API_URL,
                headers=headers,
                json=payload
            ) as response:
                # Проверяем статус ответа перед чтением
                if response.status_code == 503:
                    # Модель еще загружается
                    try:
                        error_text = await response.aread()
                        try:
                            error_data = json.loads(error_text)
                            error_msg = error_data.get("error", "Model is loading, please try again in a few moments")
                        except:
                            error_msg = "Model is loading, please try again in a few moments"
                    except:
                        error_msg = "Model is loading, please try again in a few moments"
                    yield json.dumps({"error": f"Model is loading: {error_msg}"})
                    return
                
                # Проверяем другие ошибки статуса
                if response.status_code >= 400:
                    try:
                        error_text = await response.aread()
                        try:
                            error_data = json.loads(error_text)
                            error_msg = error_data.get("error", error_data.get("message", f"HTTP {response.status_code}"))
                        except:
                            error_msg = error_text.decode('utf-8', errors='ignore')[:500] if error_text else f"HTTP {response.status_code}"
                    except:
                        error_msg = f"HTTP {response.status_code}"
                    yield json.dumps({"error": error_msg})
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
                
    except httpx.TimeoutException as e:
        logger.error(f"Timeout error in Llama streaming: {str(e)}")
        yield json.dumps({"error": "Request timeout: The API did not respond in time. Please try again."})
    except httpx.NetworkError as e:
        logger.error(f"Network error in Llama streaming: {str(e)}")
        yield json.dumps({"error": "Network error: Unable to connect to Hugging Face API. Please check your internet connection."})
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error in Llama streaming: {str(e)}")
        try:
            error_text = e.response.text[:500] if e.response else "Unknown error"
        except:
            error_text = f"HTTP {e.response.status_code}" if e.response else "Unknown error"
        error_msg = f"HTTP {e.response.status_code if e.response else 'unknown'}: {error_text}"
        yield json.dumps({"error": error_msg})
    except Exception as e:
        logger.error(f"Unexpected error in Llama streaming: {str(e)}", exc_info=True)
        yield json.dumps({"error": f"Error: {str(e)}"})

