#!/usr/bin/env python3
"""
Скрипт для проверки состояния сервера
"""
import os
import sys
from pathlib import Path

def check_env():
    """Проверка переменных окружения"""
    print("🔍 Проверка переменных окружения...")
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if api_key:
        print(f"✅ DEEPSEEK_API_KEY установлен (длина: {len(api_key)})")
        return True
    else:
        print("❌ DEEPSEEK_API_KEY не установлен")
        print("   Создайте файл .env с содержимым: DEEPSEEK_API_KEY=ваш-ключ")
        return False

def check_dependencies():
    """Проверка зависимостей"""
    print("\n🔍 Проверка зависимостей...")
    try:
        import fastapi
        import httpx
        import uvicorn
        print("✅ Все необходимые Python пакеты установлены")
        return True
    except ImportError as e:
        print(f"❌ Отсутствует пакет: {e.name}")
        print("   Установите зависимости: pip install -r requirements.txt")
        return False

def check_static():
    """Проверка статических файлов"""
    print("\n🔍 Проверка статических файлов...")
    static_dir = Path("static")
    if static_dir.exists():
        index_file = static_dir / "index.html"
        if index_file.exists():
            print("✅ Статические файлы найдены")
            return True
        else:
            print("❌ static/index.html не найден")
            print("   Запустите: npm run build")
            return False
    else:
        print("❌ Папка static не существует")
        print("   Запустите: npm run build")
        return False

def check_port():
    """Проверка доступности порта"""
    print("\n🔍 Проверка порта 8000...")
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', 8000))
    sock.close()
    if result == 0:
        print("✅ Порт 8000 доступен")
        return True
    else:
        print("⚠️  Порт 8000 не занят (сервер может быть не запущен)")
        return True  # Это не ошибка, просто информация

def main():
    print("=" * 50)
    print("Проверка состояния сервера")
    print("=" * 50)
    
    checks = [
        check_env(),
        check_dependencies(),
        check_static(),
        check_port()
    ]
    
    print("\n" + "=" * 50)
    if all(checks):
        print("✅ Все проверки пройдены успешно!")
        sys.exit(0)
    else:
        print("❌ Некоторые проверки не пройдены")
        print("\nРекомендации:")
        print("1. Убедитесь, что .env файл существует с DEEPSEEK_API_KEY")
        print("2. Установите зависимости: pip install -r requirements.txt")
        print("3. Соберите фронтенд: npm run build")
        print("4. Запустите сервер: uvicorn main:app --host 0.0.0.0 --port 8000")
        sys.exit(1)

if __name__ == "__main__":
    main()

