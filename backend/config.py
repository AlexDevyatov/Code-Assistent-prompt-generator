"""Конфигурация приложения"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# DeepSeek API настройки
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
API_KEY = os.getenv("DEEPSEEK_API_KEY")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "1000"))

# Hugging Face API настройки (для Llama 3.2-1B-Instruct)
# Используем Instruct версию модели, которая поддерживает instruction/chat задачи
# Используем router API с chat completions endpoint (OpenAI-совместимый формат)
HUGGINGFACE_API_URL = "https://router.huggingface.co/v1/chat/completions"
HUGGINGFACE_MODEL = "meta-llama/Llama-3.2-1B-Instruct"  # Модель передается в теле запроса
HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")  # Опционально, требуется только для использования Llama API

# MCP сервер настройки
#
# MCP Weather server развернут рядом с нашим backend (тот же хост), порт 9001.
# По умолчанию MCP на 185.28.85.26:9001; при необходимости переопределяйте
# через переменную окружения MCP_WEATHER_SERVER_URL.
MCP_WEATHER_SERVER_URL = os.getenv("MCP_WEATHER_SERVER_URL", "http://185.28.85.26:9001")
MCP_USE_HTTP = os.getenv("MCP_USE_HTTP", "true").lower() == "true"

# Настройки приложения
STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

if not API_KEY:
    raise ValueError("DEEPSEEK_API_KEY not found in environment variables")

