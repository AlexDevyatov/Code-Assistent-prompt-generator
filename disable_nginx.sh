#!/bin/bash

# Скрипт для отключения Nginx на сервере
# Использование: ./disable_nginx.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}🔍 Проверка наличия Nginx...${NC}"

if ! command -v nginx &> /dev/null; then
    echo -e "${GREEN}✅ Nginx не установлен, ничего делать не нужно${NC}"
    exit 0
fi

echo -e "${BLUE}ℹ️  Nginx установлен${NC}"

# Проверка статуса
if systemctl is-active --quiet nginx 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Nginx запущен${NC}"
    echo -e "${YELLOW}Остановка Nginx...${NC}"
    sudo systemctl stop nginx
    echo -e "${GREEN}✅ Nginx остановлен${NC}"
else
    echo -e "${BLUE}ℹ️  Nginx не запущен${NC}"
fi

# Отключение автозапуска
if systemctl is-enabled --quiet nginx 2>/dev/null; then
    echo -e "${YELLOW}Отключение автозапуска Nginx...${NC}"
    sudo systemctl disable nginx
    echo -e "${GREEN}✅ Автозапуск Nginx отключен${NC}"
else
    echo -e "${BLUE}ℹ️  Автозапуск Nginx уже отключен${NC}"
fi

# Удаление конфигурации для этого проекта (если есть)
if [ -f "/etc/nginx/sites-enabled/deepseek-web-client" ]; then
    echo -e "${YELLOW}Удаление конфигурации deepseek-web-client...${NC}"
    sudo rm /etc/nginx/sites-enabled/deepseek-web-client
    echo -e "${GREEN}✅ Конфигурация удалена${NC}"
fi

if [ -f "/etc/nginx/sites-available/deepseek-web-client" ]; then
    echo -e "${YELLOW}Удаление конфигурации из sites-available...${NC}"
    sudo rm /etc/nginx/sites-available/deepseek-web-client
    echo -e "${GREEN}✅ Конфигурация удалена${NC}"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Nginx отключен для этого проекта${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📋 Важно:${NC}"
echo -e "   - Приложение работает напрямую на порту 8000"
echo -e "   - Обращайтесь к приложению: http://ваш-ip:8000"
echo -e "   - Nginx остановлен и не будет запускаться автоматически"
echo ""
echo -e "${YELLOW}💡 Если нужно полностью удалить Nginx:${NC}"
echo -e "   sudo apt remove nginx nginx-common -y"
echo ""

