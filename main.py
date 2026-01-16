from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
import httpx
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    try:
        logger.info(f"Received chat request: messages={bool(request.messages)}, prompt={bool(request.prompt)}")
        
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
            logger.error("Neither 'prompt' nor 'messages' provided")
            raise HTTPException(status_code=400, detail="Either 'prompt' or 'messages' must be provided")
        
        if not API_KEY:
            logger.error("API_KEY is not set")
            raise HTTPException(status_code=500, detail="API key is not configured")
        
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "deepseek-chat",
            "messages": messages,
            "temperature": 0.3
        }
        
        logger.info(f"Sending request to DeepSeek API with {len(messages)} messages")
        
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
                result = {"response": data["choices"][0]["message"]["content"]}
                logger.info("Successfully received response from DeepSeek API")
                return result
            else:
                logger.error(f"Unexpected response format: {data}")
                raise HTTPException(status_code=500, detail="Unexpected response format from DeepSeek API")
                
    except httpx.HTTPStatusError as e:
        logger.error(f"DeepSeek API HTTP error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code, 
            detail=f"DeepSeek API error: {e.response.text}"
        )
    except httpx.RequestError as e:
        logger.error(f"Request error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Request error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# Health check endpoint
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "api_key_configured": bool(API_KEY),
        "static_dir_exists": static_dir.exists()
    }

# Отдаём статические файлы из папки static
# html=True позволяет отдавать index.html для всех маршрутов (SPA)
if static_dir.exists():
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
else:
    logger.warning(f"Static directory {static_dir} does not exist. Run 'npm run build' first.")

