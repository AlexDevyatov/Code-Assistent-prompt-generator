"""Роутер для обработки запросов к Llama API"""
import logging
from typing import Optional, List, Dict
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.services.llama_api import call_llama_api, stream_llama_api

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/llama", tags=["llama"])


class LlamaRequest(BaseModel):
    prompt: Optional[str] = None
    system_prompt: Optional[str] = None
    messages: Optional[List[Dict[str, str]]] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


def _prepare_messages(request: LlamaRequest) -> List[Dict[str, str]]:
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
async def llama_stream(request: LlamaRequest):
    """Streaming endpoint для получения ответов от Llama по частям"""
    try:
        logger.info(f"Received streaming Llama request: messages={bool(request.messages)}, prompt={bool(request.prompt)}")
        
        messages = _prepare_messages(request)
        temperature = request.temperature if request.temperature is not None else 0.7
        max_tokens = request.max_tokens
        
        async def generate():
            async for chunk in stream_llama_api(messages, temperature=temperature, max_tokens=max_tokens):
                yield f"data: {chunk}\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in Llama streaming: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("")
async def llama(request: LlamaRequest):
    """Обычный endpoint для получения ответа от Llama"""
    try:
        logger.info(f"Received Llama request: messages={bool(request.messages)}, prompt={bool(request.prompt)}")
        
        messages = _prepare_messages(request)
        temperature = request.temperature if request.temperature is not None else 0.7
        max_tokens = request.max_tokens
        
        logger.info(f"Sending request to Llama API with {len(messages)} messages, temperature={temperature}, max_tokens={max_tokens}")
        if request.system_prompt:
            logger.info(f"System prompt: {request.system_prompt[:100]}...")
        
        data = await call_llama_api(messages, temperature=temperature, max_tokens=max_tokens)
        
        # Извлекаем ответ из структуры Hugging Face API
        # Формат ответа может быть: [{"generated_text": "..."}] или {"generated_text": "..."}
        generated_text = ""
        if isinstance(data, list) and len(data) > 0:
            generated_text = data[0].get("generated_text", "")
            logger.info(f"Extracted text from list format, length: {len(generated_text)}")
        elif isinstance(data, dict):
            if "generated_text" in data:
                generated_text = data.get("generated_text", "")
                logger.info(f"Extracted text from dict format (generated_text), length: {len(generated_text)}")
            elif "text" in data:
                generated_text = data.get("text", "")
                logger.info(f"Extracted text from dict format (text), length: {len(generated_text)}")
        
        if generated_text:
            # Убираем префикс промпта, если он есть
            messages_text = "".join([f"{m.get('role', '')}: {m.get('content', '')}" for m in messages])
            if messages_text in generated_text:
                generated_text = generated_text[len(messages_text):].strip()
            
            result = {"response": generated_text}
            logger.info(f"Successfully received response from Llama API, length: {len(generated_text)}")
            return result
        else:
            # Если формат неожиданный, пытаемся вернуть весь ответ
            logger.warning(f"Unexpected response format: {data}")
            result = {"response": f"[Unexpected format: {str(data)[:500]}]"}
            return result
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

