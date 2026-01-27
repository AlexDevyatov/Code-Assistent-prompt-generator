"""Главный файл приложения FastAPI"""
import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.config import STATIC_DIR
from backend.routers import chat, health, llama, compression, summaries, mcp
from backend.services.summaries_db import init_db

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Проверка, что MCP роутер импортирован
try:
    logger.info(f"MCP router imported: {mcp.router.prefix}, routes: {len(mcp.router.routes)}")
except Exception as e:
    logger.error(f"Error importing MCP router: {e}")

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(chat.router)
app.include_router(health.router)
app.include_router(llama.router)
app.include_router(compression.router)
app.include_router(summaries.router)
app.include_router(mcp.router)
logger.info(f"MCP router registered with prefix: {mcp.router.prefix}")


@app.on_event("startup")
def on_startup():
    """Инициализация БД суммаризаций при старте приложения."""
    init_db()


# Отдаём статические файлы из папки static
# html=True позволяет отдавать index.html для всех маршрутов (SPA)
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
else:
    logger.warning(f"Static directory {STATIC_DIR} does not exist. Run 'npm run build' first.")

