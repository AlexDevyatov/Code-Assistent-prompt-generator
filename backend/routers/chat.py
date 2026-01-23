"""Роутер для обработки чата"""
import logging
from typing import Optional, List, Dict
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.services.deepseek_api import call_deepseek_api, stream_deepseek_api
from backend.config import MAX_TOKENS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    prompt: Optional[str] = None
    system_prompt: Optional[str] = None
    messages: Optional[List[Dict[str, str]]] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


def _prepare_messages(request: ChatRequest) -> List[Dict[str, str]]:
    """
    Подготовка сообщений из запроса
    Отправляет только system_prompt и текущий запрос пользователя (без истории)
    
    Args:
        request: Запрос с промптом или сообщениями
    
    Returns:
        Список сообщений в формате для API (только system_prompt + текущий запрос)
    """
    messages = []
    
    # Добавляем system_prompt, если он есть
    if request.system_prompt:
        messages.append({"role": "system", "content": request.system_prompt})
    
    # Определяем текущий запрос пользователя
    user_content = None
    if request.prompt:
        # Если есть prompt, используем его
        user_content = request.prompt
    elif request.messages:
        # Если есть messages, берем только последнее сообщение от пользователя
        for msg in reversed(request.messages):
            if isinstance(msg, dict) and msg.get("role") == "user":
                user_content = msg.get("content")
                break
        # Если не нашли user сообщение, берем последнее сообщение
        if not user_content and len(request.messages) > 0:
            last_msg = request.messages[-1]
            if isinstance(last_msg, dict):
                user_content = last_msg.get("content", "")
    else:
        raise HTTPException(status_code=400, detail="Either 'prompt' or 'messages' must be provided")
    
    # Добавляем только текущий запрос пользователя
    if user_content:
        messages.append({"role": "user", "content": user_content})
    else:
        raise HTTPException(status_code=400, detail="No user message found in request")
    
    return messages


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """Streaming endpoint для получения ответов по частям"""
    try:
        logger.info(f"Received streaming chat request: messages={bool(request.messages)}, prompt={bool(request.prompt)}")
        
        messages = _prepare_messages(request)
        temperature = request.temperature if request.temperature is not None else 0.3
        max_tokens = request.max_tokens
        
        async def generate():
            async for chunk in stream_deepseek_api(messages, temperature=temperature, max_tokens=max_tokens):
                yield f"data: {chunk}\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in streaming: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("")
async def chat(request: ChatRequest):
    """Обычный endpoint для получения ответа"""
    try:
        logger.info(f"Received chat request: messages={bool(request.messages)}, prompt={bool(request.prompt)}")
        
        messages = _prepare_messages(request)
        temperature = request.temperature if request.temperature is not None else 0.3
        max_tokens = request.max_tokens
        
        logger.info(f"Sending request to DeepSeek API with {len(messages)} messages, temperature={temperature}, max_tokens={max_tokens}")
        if request.system_prompt:
            logger.info(f"System prompt: {request.system_prompt[:100]}...")
        
        data = await call_deepseek_api(messages, temperature=temperature, max_tokens=max_tokens)
        
        # Извлекаем ответ из структуры DeepSeek API
        if "choices" in data and len(data["choices"]) > 0:
            choice = data["choices"][0]
            response_content = choice["message"]["content"]
            finish_reason = choice.get("finish_reason", "stop")
            
            # Инициализируем переменные для токенов
            initial_usage = data.get("usage", {})
            prompt_tokens = initial_usage.get("prompt_tokens", 0)
            completion_tokens = initial_usage.get("completion_tokens", 0)
            
            # Если ответ обрезан из-за лимита токенов, запрашиваем продолжение
            if finish_reason == "length":
                logger.info("Response was truncated, requesting continuation...")
                # Добавляем текущий ответ в контекст и запрашиваем продолжение
                continuation_messages = messages + [
                    {"role": "assistant", "content": response_content},
                    {"role": "user", "content": "Продолжи ответ с того места, где остановился. Ответ должен быть полным."}
                ]
                
                # Вычисляем доступные токены для продолжения
                initial_total = initial_usage.get("total_tokens", 0)
                max_total_tokens = max_tokens or MAX_TOKENS
                remaining_tokens = max_total_tokens - initial_total
                
                if remaining_tokens > 100:  # Запрашиваем продолжение только если есть достаточно токенов
                    continuation_max_tokens = min(remaining_tokens, 500)  # Ограничиваем продолжение
                    continuation_data = await call_deepseek_api(
                        continuation_messages, 
                        temperature=temperature, 
                        max_tokens=continuation_max_tokens
                    )
                    
                    if "choices" in continuation_data and len(continuation_data["choices"]) > 0:
                        continuation_content = continuation_data["choices"][0]["message"]["content"]
                        response_content += continuation_content
                        
                        # Обновляем информацию о токенах
                        if "usage" in continuation_data:
                            continuation_usage = continuation_data["usage"]
                            # Для продолжения prompt токены будут больше (включают предыдущий ответ)
                            # Но completion токены - это только новые токены
                            continuation_completion = continuation_usage.get("completion_tokens", 0)
                            completion_tokens = completion_tokens + continuation_completion
                            # Общий prompt остается примерно таким же (может немного увеличиться)
                            prompt_tokens = continuation_usage.get("prompt_tokens", prompt_tokens)
            
            result = {"response": response_content}
            
            # Добавляем информацию о токенах
            result["usage"] = {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens
            }
            
            logger.info("Successfully received response from DeepSeek API")
            return result
        else:
            logger.error(f"Unexpected response format: {data}")
            raise HTTPException(status_code=500, detail="Unexpected response format from DeepSeek API")
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

