"""Роутер для health check"""
from fastapi import APIRouter
from pathlib import Path

from backend.config import API_KEY, STATIC_DIR

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "api_key_configured": bool(API_KEY),
        "static_dir_exists": STATIC_DIR.exists()
    }

