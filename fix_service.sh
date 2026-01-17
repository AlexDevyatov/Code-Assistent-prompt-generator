#!/bin/bash

# Скрипт для исправления проблемы с запуском systemd сервиса
# Использование: ./fix_service.sh

SYSTEMD_FILE="/etc/systemd/system/deepseek-web-client.service"
PROJECT_DIR="/opt/Code-Assistent-prompt-generator"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}🔧 Исправление проблемы с systemd сервисом${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# 1. Проверка существования проекта
echo -e "${YELLOW}1. Проверка директории проекта...${NC}"
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ Директория проекта не найдена: $PROJECT_DIR${NC}"
    echo -e "${YELLOW}💡 Укажите правильный путь к проекту${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Директория проекта найдена${NC}"
cd "$PROJECT_DIR"
echo ""

# 2. Проверка виртуального окружения
echo -e "${YELLOW}2. Проверка виртуального окружения...${NC}"
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}⚠️  Виртуальное окружение не найдено, создание...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✅ Виртуальное окружение создано${NC}"
else
    echo -e "${GREEN}✅ Виртуальное окружение найдено${NC}"
fi

# Активируем venv и проверяем uvicorn
source venv/bin/activate
echo ""

# 3. Проверка uvicorn
echo -e "${YELLOW}3. Проверка uvicorn...${NC}"
UVICORN_PATH="venv/bin/uvicorn"
if [ ! -f "$UVICORN_PATH" ]; then
    echo -e "${YELLOW}⚠️  uvicorn не найден, установка зависимостей...${NC}"
    if [ -f "requirements.txt" ]; then
        pip install -r requirements.txt
        echo -e "${GREEN}✅ Зависимости установлены${NC}"
    else
        echo -e "${RED}❌ requirements.txt не найден${NC}"
        pip install fastapi uvicorn httpx python-dotenv pydantic
        echo -e "${GREEN}✅ Базовые зависимости установлены${NC}"
    fi
else
    echo -e "${GREEN}✅ uvicorn найден${NC}"
fi

# Проверяем, что uvicorn работает
if [ -f "$UVICORN_PATH" ]; then
    UVICORN_ABS_PATH="$(pwd)/$UVICORN_PATH"
    echo -e "${BLUE}   Путь к uvicorn: $UVICORN_ABS_PATH${NC}"
    
    # Проверяем права на выполнение
    if [ ! -x "$UVICORN_PATH" ]; then
        echo -e "${YELLOW}⚠️  Нет прав на выполнение, исправление...${NC}"
        chmod +x "$UVICORN_PATH"
    fi
else
    echo -e "${RED}❌ uvicorn все еще не найден после установки${NC}"
    exit 1
fi
deactivate
echo ""

# 4. Проверка backend/main.py
echo -e "${YELLOW}4. Проверка backend/main.py...${NC}"
if [ ! -f "backend/main.py" ]; then
    echo -e "${RED}❌ backend/main.py не найден${NC}"
    exit 1
fi
echo -e "${GREEN}✅ backend/main.py найден${NC}"
echo ""

# 5. Обновление systemd файла
echo -e "${YELLOW}5. Обновление конфигурации systemd...${NC}"
if [ ! -f "$SYSTEMD_FILE" ]; then
    echo -e "${RED}❌ Файл systemd не найден: $SYSTEMD_FILE${NC}"
    echo -e "${YELLOW}Создание файла сервиса...${NC}"
    
    # Определяем пользователя
    SERVICE_USER=$(whoami)
    if [ "$SERVICE_USER" = "root" ]; then
        SERVICE_USER="www-data"
    fi
    
    sudo tee "$SYSTEMD_FILE" > /dev/null <<EOF
[Unit]
Description=DeepSeek Web Client API
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$PROJECT_DIR/venv/bin"
ExecStart=$PROJECT_DIR/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    echo -e "${GREEN}✅ Файл сервиса создан${NC}"
else
    echo -e "${GREEN}✅ Файл сервиса найден${NC}"
    
    # Обновляем пути в существующем файле
    echo -e "${YELLOW}Обновление путей в конфигурации...${NC}"
    
    # Создаем резервную копию
    BACKUP_FILE="${SYSTEMD_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    sudo cp "$SYSTEMD_FILE" "$BACKUP_FILE"
    echo -e "${GREEN}✅ Резервная копия создана: $BACKUP_FILE${NC}"
    
    # Обновляем WorkingDirectory
    sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=$PROJECT_DIR|g" "$SYSTEMD_FILE"
    
    # Обновляем ExecStart
    sudo sed -i "s|ExecStart=.*|ExecStart=$PROJECT_DIR/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000|g" "$SYSTEMD_FILE"
    
    # Обновляем PATH
    sudo sed -i "s|Environment=\"PATH=.*|Environment=\"PATH=$PROJECT_DIR/venv/bin\"|g" "$SYSTEMD_FILE"
    
    echo -e "${GREEN}✅ Конфигурация обновлена${NC}"
fi

# Показываем обновленную конфигурацию
echo ""
echo -e "${BLUE}Текущая конфигурация:${NC}"
echo -e "${BLUE}WorkingDirectory:${NC}"
grep "WorkingDirectory" "$SYSTEMD_FILE" | head -1
echo -e "${BLUE}ExecStart:${NC}"
grep "ExecStart" "$SYSTEMD_FILE" | head -1
echo ""

# 6. Перезагрузка systemd и запуск сервиса
echo -e "${YELLOW}6. Перезагрузка systemd...${NC}"
sudo systemctl daemon-reload
echo -e "${GREEN}✅ Systemd перезагружен${NC}"
echo ""

# 7. Проверка прав доступа
echo -e "${YELLOW}7. Проверка прав доступа...${NC}"
SERVICE_USER=$(grep "^User=" "$SYSTEMD_FILE" | cut -d'=' -f2)
if [ -n "$SERVICE_USER" ]; then
    echo -e "${BLUE}   Пользователь сервиса: $SERVICE_USER${NC}"
    
    # Проверяем права на директорию проекта
    if sudo -u "$SERVICE_USER" test -r "$PROJECT_DIR/backend/main.py"; then
        echo -e "${GREEN}✅ Пользователь $SERVICE_USER имеет доступ к проекту${NC}"
    else
        echo -e "${YELLOW}⚠️  Проблемы с правами доступа${NC}"
        echo -e "${YELLOW}   Установка прав...${NC}"
        sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$PROJECT_DIR" 2>/dev/null || true
        echo -e "${GREEN}✅ Права обновлены${NC}"
    fi
fi
echo ""

# 8. Запуск сервиса
echo -e "${YELLOW}8. Запуск сервиса...${NC}"
sudo systemctl stop deepseek-web-client 2>/dev/null || true
sleep 1
sudo systemctl start deepseek-web-client
sleep 3

# 9. Проверка статуса
echo -e "${YELLOW}9. Проверка статуса...${NC}"
if systemctl is-active --quiet deepseek-web-client; then
    echo -e "${GREEN}✅ Сервис запущен и работает!${NC}"
    
    # Проверяем порт
    sleep 2
    if netstat -tuln 2>/dev/null | grep -q ":8000 " || ss -tuln 2>/dev/null | grep -q ":8000 "; then
        echo -e "${GREEN}✅ Порт 8000 слушается${NC}"
    fi
    
    # Проверяем health endpoint
    sleep 1
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null | grep -q "200"; then
        echo -e "${GREEN}✅ Health endpoint отвечает${NC}"
    fi
else
    echo -e "${RED}❌ Сервис не запустился${NC}"
    echo -e "${YELLOW}Последние логи:${NC}"
    sudo journalctl -u deepseek-web-client -n 10 --no-pager
    exit 1
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Проблема исправлена!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📋 Следующие шаги:${NC}"
echo -e "   1. Откройте порт в файрволе: sudo ufw allow 8000/tcp"
echo -e "   2. Проверьте доступность: curl http://localhost:8000/api/health"
echo -e "   3. Проверьте статус: sudo systemctl status deepseek-web-client"
echo ""

