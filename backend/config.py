"""Конфигурация приложения"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# DeepSeek API настройки
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
API_KEY = os.getenv("DEEPSEEK_API_KEY")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "1000"))

# Настройки приложения
STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

if not API_KEY:
    raise ValueError("DEEPSEEK_API_KEY not found in environment variables")

