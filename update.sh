#!/bin/bash

# Скрипт для применения изменений и обновления проекта на сервере
# Использование: ./update.sh [--full] [--skip-git] [--skip-deps]

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Параметры
FULL_UPDATE=false
SKIP_GIT=false
SKIP_DEPS=false
PROJECT_DIR="/opt/Code-Assistent-prompt-generator"

# Парсинг аргументов
for arg in "$@"; do
    case $arg in
        --full)
            FULL_UPDATE=true
            shift
            ;;
        --skip-git)
            SKIP_GIT=true
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        *)
            ;;
    esac
done

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}🔄 Обновление проекта${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# Проверка директории проекта
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ Директория проекта не найдена: $PROJECT_DIR${NC}"
    echo -e "${YELLOW}💡 Убедитесь, что проект находится в правильной директории${NC}"
    exit 1
fi

cd "$PROJECT_DIR"
echo -e "${GREEN}✅ Рабочая директория: $PROJECT_DIR${NC}"
echo ""

# 1. Получение изменений из git
if [ "$SKIP_GIT" = false ]; then
    echo -e "${YELLOW}1. Получение изменений из git...${NC}"
    if git pull; then
        echo -e "${GREEN}✅ Изменения получены${NC}"
    else
        echo -e "${YELLOW}⚠️  Не удалось получить изменения из git${NC}"
    fi
    echo ""
else
    echo -e "${BLUE}⏭️  Пропущено получение изменений из git${NC}"
    echo ""
fi

# 2. Обновление зависимостей
if [ "$SKIP_DEPS" = false ]; then
    echo -e "${YELLOW}2. Обновление зависимостей...${NC}"
    
    # Node.js зависимости
    if [ -f "package.json" ]; then
        echo -e "${BLUE}   Обновление Node.js зависимостей...${NC}"
        npm install
        echo -e "${GREEN}✅ Node.js зависимости обновлены${NC}"
    fi
    
    # Python зависимости
    if [ -d "venv" ]; then
        echo -e "${BLUE}   Обновление Python зависимостей...${NC}"
        source venv/bin/activate
        pip install -r requirements.txt --quiet
        deactivate
        echo -e "${GREEN}✅ Python зависимости обновлены${NC}"
    else
        echo -e "${YELLOW}⚠️  Виртуальное окружение не найдено${NC}"
        if [ "$FULL_UPDATE" = true ]; then
            echo -e "${YELLOW}   Создание виртуального окружения...${NC}"
            python3 -m venv venv
            source venv/bin/activate
            pip install -r requirements.txt
            deactivate
            echo -e "${GREEN}✅ Виртуальное окружение создано${NC}"
        fi
    fi
    echo ""
else
    echo -e "${BLUE}⏭️  Пропущено обновление зависимостей${NC}"
    echo ""
fi

# 3. Сборка фронтенда
echo -e "${YELLOW}3. Сборка фронтенда...${NC}"
if npm run build; then
    echo -e "${GREEN}✅ Фронтенд собран${NC}"
else
    echo -e "${RED}❌ Ошибка при сборке фронтенда${NC}"
    exit 1
fi
echo ""

# 4. Проверка и исправление конфигурации systemd
if [ "$FULL_UPDATE" = true ]; then
    echo -e "${YELLOW}4. Проверка конфигурации systemd...${NC}"
    SYSTEMD_FILE="/etc/systemd/system/deepseek-web-client.service"
    
    if [ -f "$SYSTEMD_FILE" ]; then
        # Проверяем пути в конфигурации
        if ! grep -q "$PROJECT_DIR" "$SYSTEMD_FILE"; then
            echo -e "${YELLOW}   Обновление путей в конфигурации...${NC}"
            
            # Создаем резервную копию
            BACKUP_FILE="${SYSTEMD_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
            sudo cp "$SYSTEMD_FILE" "$BACKUP_FILE"
            
            # Обновляем пути
            sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=$PROJECT_DIR|g" "$SYSTEMD_FILE"
            sudo sed -i "s|ExecStart=.*|ExecStart=$PROJECT_DIR/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000|g" "$SYSTEMD_FILE"
            sudo sed -i "s|Environment=\"PATH=.*|Environment=\"PATH=$PROJECT_DIR/venv/bin\"|g" "$SYSTEMD_FILE"
            
            # Проверяем, что есть --host 0.0.0.0
            if ! grep "ExecStart" "$SYSTEMD_FILE" | grep -q "0.0.0.0"; then
                sudo sed -i 's|uvicorn backend.main:app|uvicorn backend.main:app --host 0.0.0.0|g' "$SYSTEMD_FILE"
            fi
            
            sudo systemctl daemon-reload
            echo -e "${GREEN}✅ Конфигурация обновлена${NC}"
        else
            echo -e "${GREEN}✅ Конфигурация systemd корректна${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Файл systemd не найден${NC}"
        echo -e "${YELLOW}💡 Создайте файл сервиса (см. DEPLOY.md)${NC}"
    fi
    echo ""
fi

# 5. Проверка и открытие порта в файрволе
if [ "$FULL_UPDATE" = true ]; then
    echo -e "${YELLOW}5. Проверка файрвола...${NC}"
    if command -v ufw &> /dev/null; then
        if ! ufw status | grep -q "8000/tcp"; then
            echo -e "${YELLOW}   Открытие порта 8000...${NC}"
            sudo ufw allow 8000/tcp 2>/dev/null || true
            echo -e "${GREEN}✅ Порт 8000 открыт${NC}"
        else
            echo -e "${GREEN}✅ Порт 8000 уже открыт${NC}"
        fi
    fi
    echo ""
fi

# 6. Перезапуск сервиса (через fix_service.sh --restart-only, все проверки под sudo)
echo -e "${YELLOW}6. Перезапуск сервиса...${NC}"
if [ -f "$PROJECT_DIR/fix_service.sh" ]; then
    chmod +x "$PROJECT_DIR/fix_service.sh" 2>/dev/null || true
    if "$PROJECT_DIR/fix_service.sh" --restart-only; then
        :
    else
        echo -e "${YELLOW}💡 Запустите ./fix_service.sh для полной диагностики и исправления${NC}"
    fi
else
    echo -e "${BLUE}ℹ️  fix_service.sh не найден, пропуск перезапуска${NC}"
fi
echo ""

# 7. Проверка работоспособности
echo -e "${YELLOW}7. Проверка работоспособности...${NC}"
sleep 2

# Проверка порта
if netstat -tuln 2>/dev/null | grep -q ":8000 " || ss -tuln 2>/dev/null | grep -q ":8000 "; then
    echo -e "${GREEN}✅ Порт 8000 слушается${NC}"
    
    # Проверка health endpoint
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null | grep -q "200"; then
        echo -e "${GREEN}✅ Health endpoint отвечает${NC}"
    else
        echo -e "${YELLOW}⚠️  Health endpoint не отвечает${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Порт 8000 не слушается${NC}"
fi
echo ""

# Финальная информация
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Обновление завершено!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📋 Информация:${NC}"
echo -e "   - Версия: $(git rev-parse --short HEAD 2>/dev/null || echo 'неизвестна')"
echo -e "   - Директория: $PROJECT_DIR"
echo ""
echo -e "${BLUE}🌐 Проверка доступности:${NC}"
echo -e "   - Локально: curl http://localhost:8000/api/health"
echo -e "   - Извне: http://ваш-ip:8000"
echo ""
echo -e "${YELLOW}💡 Для полной проверки запустите: ./diagnose_server.sh${NC}"
echo ""

