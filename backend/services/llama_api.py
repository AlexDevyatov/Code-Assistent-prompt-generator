"""Сервис для работы с Hugging Face Inference API (Llama 3.2-1B-Instruct)"""
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
    
    # Используем chat completions endpoint через router API
    logger.info(f"Llama request: {len(messages)} messages, temperature={temperature}, max_tokens={max_tokens}")
    
    headers = {
        "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # Chat completions endpoint использует OpenAI-совместимый формат
    payload = {
        "model": HUGGINGFACE_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens or 1000
    }
    
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
            
            # Chat completions API возвращает ответ в формате OpenAI
            # {"choices": [{"message": {"content": "..."}}]}
            if isinstance(data, dict) and "choices" in data:
                choices = data.get("choices", [])
                if len(choices) > 0:
                    content = choices[0].get("message", {}).get("content", "")
                    # Возвращаем в формате, совместимом со старым кодом
                    return [{"generated_text": content}]
            
            # Fallback для неожиданного формата
            logger.warning(f"Unexpected response format: {data}")
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
    
    # Используем chat completions endpoint через router API
    logger.info(f"Llama streaming request: {len(messages)} messages, temperature={temperature}, max_tokens={max_tokens}")
    
    headers = {
        "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # Chat completions endpoint использует OpenAI-совместимый формат с streaming
    payload = {
        "model": HUGGINGFACE_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens or 1000,
        "stream": True
    }
    
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
                    # Читаем тело ответа для детальной ошибки
                    try:
                        error_text = await response.aread()
                        error_text_decoded = error_text.decode('utf-8', errors='ignore') if error_text else ""
                        logger.error(f"Llama API error response (status {response.status_code}): {error_text_decoded[:2000]}")
                        try:
                            error_data = json.loads(error_text_decoded)
                            logger.error(f"Llama API error JSON: {json.dumps(error_data, indent=2)}")
                            # Обрабатываем разные форматы ошибок
                            if isinstance(error_data, dict):
                                if "error" in error_data and isinstance(error_data["error"], dict):
                                    error_msg = error_data["error"].get("message", error_data["error"].get("error", f"HTTP {response.status_code}"))
                                else:
                                    error_msg = error_data.get("error", error_data.get("message", error_data.get("detail", f"HTTP {response.status_code}")))
                            else:
                                error_msg = str(error_data)[:500]
                        except:
                            error_msg = error_text_decoded[:500] if error_text_decoded else f"HTTP {response.status_code}"
                    except Exception as ex:
                        logger.error(f"Failed to read error response: {ex}", exc_info=True)
                        error_msg = f"HTTP {response.status_code}"
                    yield json.dumps({"error": error_msg})
                    return
                
                response.raise_for_status()
                
                # Chat completions API с streaming возвращает Server-Sent Events (SSE)
                # Формат: "data: {json}\n\n"
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    
                    # Пропускаем служебные строки SSE
                    if line.startswith("data: "):
                        data_str = line[6:]  # Убираем "data: "
                        if data_str.strip() == "[DONE]":
                            break
                        
                        try:
                            chunk_data = json.loads(data_str)
                            # Формат OpenAI streaming: {"choices": [{"delta": {"content": "..."}}]}
                            if isinstance(chunk_data, dict) and "choices" in chunk_data:
                                choices = chunk_data.get("choices", [])
                                if len(choices) > 0:
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        yield json.dumps({"content": content})
                        except json.JSONDecodeError as e:
                            logger.warning(f"Failed to parse SSE chunk: {e}, line: {line[:100]}")
                            continue
                    elif line.startswith(":"):
                        # Комментарии SSE, пропускаем
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

