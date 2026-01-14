from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict
import httpx
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Создаём папку static, если её нет
static_dir = Path("static")
static_dir.mkdir(exist_ok=True)

DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
API_KEY = os.getenv("DEEPSEEK_API_KEY")

if not API_KEY:
    raise ValueError("DEEPSEEK_API_KEY not found in environment variables")


class ChatRequest(BaseModel):
    prompt: Optional[str] = None
    system_prompt: Optional[str] = None
    messages: Optional[List[Dict[str, str]]] = None


@app.post("/api/chat")
async def chat(request: ChatRequest):
    # Поддержка старого формата (только prompt) и нового (system_prompt + messages)
    if request.messages:
        # Новый формат с историей сообщений
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.extend(request.messages)
    elif request.prompt:
        # Старый формат для обратной совместимости
        messages = [{"role": "user", "content": request.prompt}]
    else:
        raise HTTPException(status_code=400, detail="Either 'prompt' or 'messages' must be provided")
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.3  # Уменьшено для более быстрых и точных ответов
    }
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                DEEPSEEK_API_URL,
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            # Извлекаем ответ из структуры DeepSeek API
            if "choices" in data and len(data["choices"]) > 0:
                return {"response": data["choices"][0]["message"]["content"]}
            else:
                raise HTTPException(status_code=500, detail="Unexpected response format from DeepSeek API")
                
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"DeepSeek API error: {e.response.text}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Request error: {str(e)}")


# Отдаём статические файлы из папки static
# html=True позволяет отдавать index.html для всех маршрутов (SPA)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

