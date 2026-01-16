#!/bin/bash

# Скрипт для диагностики проблем с доступностью сервера
# Использование: ./diagnose_server.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}🔍 Диагностика сервера${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# 1. Проверка статуса сервиса
echo -e "${YELLOW}1. Проверка статуса сервиса deepseek-web-client...${NC}"
if systemctl is-active --quiet deepseek-web-client 2>/dev/null; then
    echo -e "${GREEN}✅ Сервис запущен${NC}"
    systemctl status deepseek-web-client --no-pager -l | head -10
else
    echo -e "${RED}❌ Сервис НЕ запущен${NC}"
    echo -e "${YELLOW}Попробуйте запустить: sudo systemctl start deepseek-web-client${NC}"
fi
echo ""

# 2. Проверка порта 8000
echo -e "${YELLOW}2. Проверка порта 8000...${NC}"
if netstat -tuln 2>/dev/null | grep -q ":8000 " || ss -tuln 2>/dev/null | grep -q ":8000 "; then
    echo -e "${GREEN}✅ Порт 8000 занят (слушается)${NC}"
    echo -e "${BLUE}Процессы на порту 8000:${NC}"
    netstat -tulpn 2>/dev/null | grep ":8000 " || ss -tulpn 2>/dev/null | grep ":8000 "
else
    echo -e "${RED}❌ Порт 8000 НЕ слушается${NC}"
    echo -e "${YELLOW}Сервис не запущен или не слушает на порту 8000${NC}"
fi
echo ""

# 3. Проверка файрвола
echo -e "${YELLOW}3. Проверка файрвола (ufw)...${NC}"
if command -v ufw &> /dev/null; then
    if ufw status | grep -q "8000"; then
        echo -e "${GREEN}✅ Порт 8000 упоминается в правилах файрвола${NC}"
        ufw status | grep "8000"
    else
        echo -e "${YELLOW}⚠️  Порт 8000 не найден в правилах файрвола${NC}"
        echo -e "${YELLOW}Откройте порт: sudo ufw allow 8000/tcp${NC}"
    fi
else
    echo -e "${BLUE}ℹ️  ufw не установлен${NC}"
fi
echo ""

# 4. Проверка логов сервиса
echo -e "${YELLOW}4. Последние логи сервиса (последние 20 строк):${NC}"
if systemctl is-active --quiet deepseek-web-client 2>/dev/null; then
    journalctl -u deepseek-web-client -n 20 --no-pager | tail -20
else
    echo -e "${YELLOW}Последние логи (даже если сервис не запущен):${NC}"
    journalctl -u deepseek-web-client -n 30 --no-pager 2>/dev/null | tail -30 || echo "Логи не найдены"
fi
echo ""

# 5. Проверка локального подключения
echo -e "${YELLOW}5. Проверка локального подключения к localhost:8000...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null | grep -q "200"; then
    echo -e "${GREEN}✅ Локальное подключение работает${NC}"
    curl -s http://localhost:8000/api/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8000/api/health
else
    echo -e "${RED}❌ Локальное подключение НЕ работает${NC}"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null || echo "000")
    echo -e "${YELLOW}HTTP код: $HTTP_CODE${NC}"
fi
echo ""

# 6. Проверка переменных окружения
echo -e "${YELLOW}6. Проверка переменных окружения...${NC}"
if [ -f ".env" ]; then
    if grep -q "DEEPSEEK_API_KEY" .env && [ -n "$(grep DEEPSEEK_API_KEY .env | cut -d'=' -f2)" ]; then
        echo -e "${GREEN}✅ .env файл существует и содержит DEEPSEEK_API_KEY${NC}"
    else
        echo -e "${RED}❌ .env файл существует, но DEEPSEEK_API_KEY не установлен или пуст${NC}"
    fi
else
    echo -e "${RED}❌ .env файл не найден${NC}"
    echo -e "${YELLOW}Создайте файл .env с содержимым: DEEPSEEK_API_KEY=ваш-ключ${NC}"
fi
echo ""

# 7. Проверка статических файлов
echo -e "${YELLOW}7. Проверка статических файлов...${NC}"
if [ -d "static" ] && [ -f "static/index.html" ]; then
    echo -e "${GREEN}✅ Статические файлы найдены${NC}"
    echo -e "${BLUE}Размер папки static: $(du -sh static 2>/dev/null | cut -f1)${NC}"
else
    echo -e "${RED}❌ Статические файлы не найдены${NC}"
    echo -e "${YELLOW}Запустите: npm run build${NC}"
fi
echo ""

# 8. Проверка конфигурации systemd
echo -e "${YELLOW}8. Проверка конфигурации systemd...${NC}"
if [ -f "/etc/systemd/system/deepseek-web-client.service" ]; then
    echo -e "${GREEN}✅ Файл сервиса найден${NC}"
    echo -e "${BLUE}Проверка ExecStart:${NC}"
    grep "ExecStart" /etc/systemd/system/deepseek-web-client.service | head -1
    echo -e "${BLUE}Проверка WorkingDirectory:${NC}"
    grep "WorkingDirectory" /etc/systemd/system/deepseek-web-client.service | head -1
else
    echo -e "${RED}❌ Файл сервиса не найден${NC}"
    echo -e "${YELLOW}Создайте файл /etc/systemd/system/deepseek-web-client.service${NC}"
fi
echo ""

# 9. Рекомендации
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}💡 Рекомендации:${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"

if ! systemctl is-active --quiet deepseek-web-client 2>/dev/null; then
    echo -e "${YELLOW}1. Запустите сервис:${NC}"
    echo -e "   sudo systemctl start deepseek-web-client"
    echo ""
fi

if command -v ufw &> /dev/null && ! ufw status | grep -q "8000"; then
    echo -e "${YELLOW}2. Откройте порт в файрволе:${NC}"
    echo -e "   sudo ufw allow 8000/tcp"
    echo ""
fi

if [ ! -f ".env" ] || ! grep -q "DEEPSEEK_API_KEY" .env; then
    echo -e "${YELLOW}3. Создайте .env файл:${NC}"
    echo -e "   echo 'DEEPSEEK_API_KEY=ваш-ключ' > .env"
    echo ""
fi

if [ ! -d "static" ] || [ ! -f "static/index.html" ]; then
    echo -e "${YELLOW}4. Соберите фронтенд:${NC}"
    echo -e "   npm run build"
    echo ""
fi

echo -e "${YELLOW}5. Проверьте, что сервис слушает на 0.0.0.0:8000 (не только localhost)${NC}"
echo -e "   В systemd файле должно быть: --host 0.0.0.0 --port 8000"
echo ""

echo -e "${BLUE}════════════════════════════════════════${NC}"

