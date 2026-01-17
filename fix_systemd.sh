#!/bin/bash

# Скрипт для проверки и исправления конфигурации systemd
# Использование: ./fix_systemd.sh

SYSTEMD_FILE="/etc/systemd/system/deepseek-web-client.service"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Проверка конфигурации systemd...${NC}"

if [ ! -f "$SYSTEMD_FILE" ]; then
    echo -e "${RED}❌ Файл сервиса не найден: $SYSTEMD_FILE${NC}"
    echo -e "${YELLOW}Создайте файл сервиса (см. DEPLOY.md, Шаг 6)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Файл сервиса найден${NC}"
echo ""

# Проверяем текущую конфигурацию
echo -e "${BLUE}Текущая конфигурация ExecStart:${NC}"
grep "ExecStart" "$SYSTEMD_FILE" | head -1

echo ""

# Проверяем, есть ли --host 0.0.0.0
if grep "ExecStart" "$SYSTEMD_FILE" | grep -q "0.0.0.0"; then
    echo -e "${GREEN}✅ Сервис уже настроен на прослушивание 0.0.0.0:8000${NC}"
    exit 0
fi

echo -e "${YELLOW}⚠️  Сервис не слушает на 0.0.0.0${NC}"
echo -e "${YELLOW}Исправление конфигурации...${NC}"

# Создаем резервную копию
BACKUP_FILE="${SYSTEMD_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
sudo cp "$SYSTEMD_FILE" "$BACKUP_FILE"
echo -e "${GREEN}✅ Резервная копия создана: $BACKUP_FILE${NC}"

# Исправляем конфигурацию
if sudo sed -i 's/--host [0-9.]*/--host 0.0.0.0/g' "$SYSTEMD_FILE" 2>/dev/null; then
    echo -e "${GREEN}✅ Конфигурация исправлена${NC}"
elif sudo sed -i 's/uvicorn backend.main:app/uvicorn backend.main:app --host 0.0.0.0/g' "$SYSTEMD_FILE" 2>/dev/null; then
    echo -e "${GREEN}✅ Конфигурация исправлена${NC}"
elif sudo sed -i 's/uvicorn main:app/uvicorn backend.main:app --host 0.0.0.0/g' "$SYSTEMD_FILE" 2>/dev/null; then
    echo -e "${GREEN}✅ Конфигурация исправлена (обновлен путь к модулю)${NC}"
else
    echo -e "${RED}❌ Не удалось автоматически исправить конфигурацию${NC}"
    echo -e "${YELLOW}Отредактируйте файл вручную:${NC}"
    echo -e "   sudo nano $SYSTEMD_FILE"
    echo ""
    echo -e "${YELLOW}Убедитесь, что строка ExecStart содержит:${NC}"
    echo -e "   ExecStart=/путь/к/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000"
    exit 1
fi

echo ""
echo -e "${BLUE}Новая конфигурация ExecStart:${NC}"
grep "ExecStart" "$SYSTEMD_FILE" | head -1

echo ""
echo -e "${YELLOW}🔄 Перезагрузка systemd...${NC}"
sudo systemctl daemon-reload

echo -e "${YELLOW}🔄 Перезапуск сервиса...${NC}"
sudo systemctl restart deepseek-web-client

sleep 2

if systemctl is-active --quiet deepseek-web-client; then
    echo -e "${GREEN}✅ Сервис перезапущен и работает${NC}"
    
    # Проверяем, что слушается на 0.0.0.0
    sleep 1
    if netstat -tuln 2>/dev/null | grep ":8000 " | grep -q "0.0.0.0" || \
       ss -tuln 2>/dev/null | grep ":8000 " | grep -q "0.0.0.0"; then
        echo -e "${GREEN}✅ Сервис слушает на 0.0.0.0:8000 (доступен извне)${NC}"
    else
        echo -e "${YELLOW}⚠️  Сервис еще не слушает на 0.0.0.0, подождите несколько секунд${NC}"
    fi
else
    echo -e "${RED}❌ Сервис не запустился${NC}"
    echo -e "${YELLOW}Проверьте логи: sudo journalctl -u deepseek-web-client -n 50${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Конфигурация исправлена!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"

