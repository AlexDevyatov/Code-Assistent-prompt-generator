"""Роутер для тестирования сжатия истории диалога"""
import json
import logging
from typing import Optional, List, Dict
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.services.deepseek_api import call_deepseek_api, stream_deepseek_api

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/compression", tags=["compression"])


class CompressionRequest(BaseModel):
    messages: List[Dict[str, str]]
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


class SummarizeRequest(BaseModel):
    messages: List[Dict[str, str]]


def _create_summary_prompt(messages: List[Dict[str, str]]) -> str:
    """
    Создает промпт для суммаризации истории диалога
    
    Args:
        messages: Список сообщений для суммаризации
    
    Returns:
        Промпт для суммаризации
    """
    # Формируем текст истории
    history_text = ""
    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        if role == "user":
            history_text += f"Пользователь: {content}\n\n"
        elif role == "assistant":
            history_text += f"Ассистент: {content}\n\n"
        elif role == "system":
            history_text += f"Система: {content}\n\n"
    
    prompt = f"""Создай краткую суммаризацию следующего диалога, сохраняя ключевую информацию, контекст и важные детали. 
Суммаризация должна быть достаточно подробной, чтобы ассистент мог продолжить диалог естественным образом.

Диалог:
{history_text}

Суммаризация:"""
    
    return prompt


async def summarize_messages(messages: List[Dict[str, str]]) -> str:
    """
    Суммаризирует список сообщений
    
    Args:
        messages: Список сообщений для суммаризации
    
    Returns:
        Текст суммаризации
    """
    if not messages:
        return ""
    
    summary_prompt = _create_summary_prompt(messages)
    
    api_messages = [
        {
            "role": "system",
            "content": "Ты помощник, который создает краткие и информативные суммаризации диалогов, сохраняя важный контекст для продолжения разговора."
        },
        {
            "role": "user",
            "content": summary_prompt
        }
    ]
    
    try:
        data = await call_deepseek_api(api_messages, temperature=0.3, max_tokens=500)
        
        if "choices" in data and len(data["choices"]) > 0:
            summary = data["choices"][0]["message"]["content"]
            logger.info(f"Created summary of {len(messages)} messages, summary length: {len(summary)}")
            return summary
        else:
            logger.error(f"Unexpected response format: {data}")
            raise HTTPException(status_code=500, detail="Unexpected response format from DeepSeek API")
    except Exception as e:
        logger.error(f"Error summarizing messages: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error summarizing messages: {str(e)}")


def compress_history(messages: List[Dict[str, str]], compression_threshold: int = 10) -> List[Dict[str, str]]:
    """
    Сжимает историю диалога, заменяя старые сообщения на summary
    
    Args:
        messages: Полная история сообщений
        compression_threshold: Количество сообщений, после которого нужно делать сжатие
    
    Returns:
        Сжатая история (summary + оставшиеся сообщения)
    """
    if len(messages) < compression_threshold:
        return messages
    
    # Берем первые compression_threshold сообщений для суммаризации
    messages_to_summarize = messages[:compression_threshold]
    remaining_messages = messages[compression_threshold:]
    
    # Создаем summary сообщение
    summary_message = {
        "role": "system",
        "content": "[Суммаризация предыдущего диалога]"
    }
    
    # Возвращаем summary + оставшиеся сообщения
    # В реальности summary будет создан асинхронно, но для структуры возвращаем placeholder
    return [summary_message] + remaining_messages


@router.post("/summarize")
async def summarize(request: SummarizeRequest):
    """Endpoint для суммаризации списка сообщений"""
    try:
        logger.info(f"Received summarize request for {len(request.messages)} messages")
        
        summary = await summarize_messages(request.messages)
        
        return {
            "summary": summary,
            "original_count": len(request.messages)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in summarize: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/chat")
async def chat_with_history(request: CompressionRequest):
    """Endpoint для чата с поддержкой истории и автоматической суммаризации"""
    try:
        logger.info(f"Received chat request with {len(request.messages)} messages in history")
        
        messages = request.messages.copy()
        temperature = request.temperature if request.temperature is not None else 0.7
        max_tokens = request.max_tokens
        
        # Проверяем, нужно ли делать суммаризацию (каждые 10 сообщений)
        compression_threshold = 10
        needs_compression = len(messages) >= compression_threshold
        
        compressed_messages = []
        summary_created = False
        summary_text = ""
        
        if needs_compression:
            # Подсчитываем, сколько раз нужно сжать (каждые 10 сообщений)
            # Берем сообщения для суммаризации (первые 10 или кратные 10)
            messages_to_summarize = []
            remaining_messages = []
            
            # Находим последнюю границу для суммаризации (кратную 10)
            last_compression_point = (len(messages) // compression_threshold) * compression_threshold
            
            if last_compression_point > 0:
                messages_to_summarize = messages[:last_compression_point]
                remaining_messages = messages[last_compression_point:]
                
                # Создаем суммаризацию
                summary_text = await summarize_messages(messages_to_summarize)
                summary_created = True
                
                # Формируем сжатую историю: summary как system сообщение + оставшиеся
                compressed_messages = [
                    {
                        "role": "system",
                        "content": f"Суммаризация предыдущего диалога ({len(messages_to_summarize)} сообщений):\n{summary_text}"
                    }
                ] + remaining_messages
            else:
                compressed_messages = messages
        else:
            compressed_messages = messages
        
        # Отправляем запрос с полной историей (сжатой или нет)
        logger.info(f"Sending request with {len(compressed_messages)} messages (compressed: {summary_created})")
        
        data = await call_deepseek_api(compressed_messages, temperature=temperature, max_tokens=max_tokens)
        
        if "choices" in data and len(data["choices"]) > 0:
            result = {
                "response": data["choices"][0]["message"]["content"],
                "compression_applied": summary_created,
                "original_message_count": len(messages),
                "compressed_message_count": len(compressed_messages),
                "summary": summary_text if summary_created else None
            }
            
            # Добавляем информацию о токенах
            if "usage" in data:
                result["usage"] = {
                    "prompt_tokens": data["usage"].get("prompt_tokens", 0),
                    "completion_tokens": data["usage"].get("completion_tokens", 0),
                    "total_tokens": data["usage"].get("total_tokens", 0)
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


@router.post("/chat/stream")
async def chat_with_history_stream(request: CompressionRequest):
    """Streaming endpoint для чата с поддержкой истории и автоматической суммаризации"""
    try:
        logger.info(f"Received streaming chat request with {len(request.messages)} messages in history")
        
        messages = request.messages.copy()
        temperature = request.temperature if request.temperature is not None else 0.7
        max_tokens = request.max_tokens
        
        # Проверяем, нужно ли делать суммаризацию
        compression_threshold = 10
        needs_compression = len(messages) >= compression_threshold
        
        compressed_messages = []
        summary_created = False
        summary_text = ""
        
        if needs_compression:
            last_compression_point = (len(messages) // compression_threshold) * compression_threshold
            
            if last_compression_point > 0:
                messages_to_summarize = messages[:last_compression_point]
                remaining_messages = messages[last_compression_point:]
                
                summary_text = await summarize_messages(messages_to_summarize)
                summary_created = True
                
                compressed_messages = [
                    {
                        "role": "system",
                        "content": f"Суммаризация предыдущего диалога ({len(messages_to_summarize)} сообщений):\n{summary_text}"
                    }
                ] + remaining_messages
            else:
                compressed_messages = messages
        else:
            compressed_messages = messages
        
        logger.info(f"Streaming with {len(compressed_messages)} messages (compressed: {summary_created})")
        
        async def generate():
            # Отправляем информацию о сжатии
            yield f"data: {json.dumps({'type': 'compression_info', 'compressed': summary_created, 'original_count': len(messages), 'compressed_count': len(compressed_messages), 'summary': summary_text if summary_created else None})}\n\n"
            
            async for chunk in stream_deepseek_api(compressed_messages, temperature=temperature, max_tokens=max_tokens):
                yield f"data: {chunk}\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in streaming: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

