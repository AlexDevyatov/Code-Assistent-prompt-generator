"""Конфигурация приложения"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# DeepSeek API настройки
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
API_KEY = os.getenv("DEEPSEEK_API_KEY")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "1000"))

# Hugging Face API настройки (для Llama 3.2-1B)
# Используем новый router API вместо устаревшего api-inference
# Новый API использует формат /v1/chat/completions
HUGGINGFACE_API_URL = "https://router.huggingface.co/v1/chat/completions"
HUGGINGFACE_MODEL = "meta-llama/Llama-3.2-1B"  # Модель передается в теле запроса
HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")  # Опционально, требуется только для использования Llama API

# Настройки приложения
STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

if not API_KEY:
    raise ValueError("DEEPSEEK_API_KEY not found in environment variables")

