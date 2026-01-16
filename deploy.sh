#!/bin/bash

# Скрипт для обновления сайта на сервере
# Использование: ./deploy.sh [путь_к_проекту] [--skip-git] [--skip-deps] [--dry-run]

set -e  # Остановка при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Параметры
SKIP_GIT=false
SKIP_DEPS=false
DRY_RUN=false
PROJECT_PATH=""

# Парсинг аргументов
for arg in "$@"; do
    case $arg in
        --skip-git)
            SKIP_GIT=true
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            if [ -z "$PROJECT_PATH" ] && [ -d "$arg" ]; then
                PROJECT_PATH="$arg"
            fi
            ;;
    esac
done

# Путь к проекту (по умолчанию текущая директория)
PROJECT_PATH="${PROJECT_PATH:-$(pwd)}"
cd "$PROJECT_PATH"

# Создание директории для логов
LOG_DIR="$PROJECT_PATH/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy_$(date +%Y%m%d_%H%M%S).log"

# Функция для логирования
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log "${GREEN}🚀 Начало деплоя проекта${NC}"
log "${YELLOW}Путь к проекту: $PROJECT_PATH${NC}"
log "${YELLOW}Лог файл: $LOG_FILE${NC}"

if [ "$DRY_RUN" = true ]; then
    log "${BLUE}🔍 Режим проверки (dry-run) - изменения не будут применены${NC}"
fi

# Проверка наличия необходимых инструментов
log "${YELLOW}🔍 Проверка необходимых инструментов...${NC}"

if ! command -v git &> /dev/null; then
    log "${RED}❌ Git не установлен${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    log "${RED}❌ npm не установлен${NC}"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    log "${RED}❌ Python3 не установлен${NC}"
    exit 1
fi

log "${GREEN}✅ Все необходимые инструменты установлены${NC}"

# Проверка, что мы в git репозитории
if [ ! -d ".git" ]; then
    log "${RED}❌ Текущая директория не является git репозиторием${NC}"
    exit 1
fi

# Сохранение текущей версии для возможного отката
CURRENT_COMMIT=$(git rev-parse HEAD)
log "${BLUE}📌 Текущая версия: $CURRENT_COMMIT${NC}"

# Получение последних изменений из git
if [ "$SKIP_GIT" = false ]; then
    log "${YELLOW}📥 Получение последних изменений из git...${NC}"
    if [ "$DRY_RUN" = false ]; then
        if git pull; then
            NEW_COMMIT=$(git rev-parse HEAD)
            if [ "$CURRENT_COMMIT" != "$NEW_COMMIT" ]; then
                log "${GREEN}✅ Изменения получены (было: ${CURRENT_COMMIT:0:7}, стало: ${NEW_COMMIT:0:7})${NC}"
            else
                log "${BLUE}ℹ️  Нет новых изменений${NC}"
            fi
        else
            log "${RED}❌ Ошибка при получении изменений${NC}"
            exit 1
        fi
    else
        log "${BLUE}🔍 [DRY-RUN] Пропущено: git pull${NC}"
    fi
else
    log "${BLUE}⏭️  Пропущено получение изменений из git (--skip-git)${NC}"
fi

# Обновление зависимостей
if [ "$SKIP_DEPS" = false ]; then
    # Обновление Node.js зависимостей
    log "${YELLOW}📦 Обновление Node.js зависимостей...${NC}"
    if [ "$DRY_RUN" = false ]; then
        if npm install; then
            log "${GREEN}✅ Node.js зависимости обновлены${NC}"
        else
            log "${RED}❌ Ошибка при обновлении Node.js зависимостей${NC}"
            exit 1
        fi
    else
        log "${BLUE}🔍 [DRY-RUN] Пропущено: npm install${NC}"
    fi

    # Обновление Python зависимостей (если есть venv)
    if [ -d "venv" ]; then
        log "${YELLOW}🐍 Обновление Python зависимостей...${NC}"
        if [ "$DRY_RUN" = false ]; then
            source venv/bin/activate
            if pip install -r requirements.txt --quiet; then
                log "${GREEN}✅ Python зависимости обновлены${NC}"
            else
                log "${YELLOW}⚠️  Предупреждение: не удалось обновить Python зависимости${NC}"
            fi
            deactivate
        else
            log "${BLUE}🔍 [DRY-RUN] Пропущено: pip install${NC}"
        fi
    else
        log "${BLUE}ℹ️  Виртуальное окружение Python не найдено, пропущено${NC}"
    fi
else
    log "${BLUE}⏭️  Пропущено обновление зависимостей (--skip-deps)${NC}"
fi

# Проверка переменных окружения
if [ "$DRY_RUN" = false ]; then
    log "${YELLOW}🔍 Проверка переменных окружения...${NC}"
    if [ -f ".env" ]; then
        if grep -q "DEEPSEEK_API_KEY" .env && [ -n "$(grep DEEPSEEK_API_KEY .env | cut -d'=' -f2 | tr -d ' ')" ]; then
            log "${GREEN}✅ .env файл существует и содержит DEEPSEEK_API_KEY${NC}"
        else
            log "${YELLOW}⚠️  .env файл существует, но DEEPSEEK_API_KEY не установлен или пуст${NC}"
            log "${YELLOW}💡 Убедитесь, что в .env есть: DEEPSEEK_API_KEY=ваш-ключ${NC}"
        fi
    else
        log "${YELLOW}⚠️  .env файл не найден${NC}"
        log "${YELLOW}💡 Создайте файл .env с содержимым: DEEPSEEK_API_KEY=ваш-ключ${NC}"
    fi
else
    log "${BLUE}🔍 [DRY-RUN] Пропущено: проверка переменных окружения${NC}"
fi

# Создание бэкапа статики перед сборкой
if [ "$DRY_RUN" = false ] && [ -d "static" ]; then
    BACKUP_DIR="static_backup_$(date +%Y%m%d_%H%M%S)"
    log "${YELLOW}💾 Создание бэкапа статики в $BACKUP_DIR...${NC}"
    cp -r static "$BACKUP_DIR" 2>/dev/null || true
    # Удаляем старые бэкапы (оставляем только последние 3)
    ls -dt static_backup_* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true
fi

# Сборка фронтенда
log "${YELLOW}🔨 Сборка фронтенда...${NC}"
if [ "$DRY_RUN" = false ]; then
    if npm run build; then
        log "${GREEN}✅ Фронтенд собран${NC}"
        
        # Проверка наличия собранных файлов
        if [ ! -f "static/index.html" ]; then
            log "${RED}❌ Ошибка: static/index.html не найден после сборки${NC}"
            exit 1
        fi
        log "${GREEN}✅ Собранные файлы проверены${NC}"
    else
        log "${RED}❌ Ошибка при сборке фронтенда${NC}"
        exit 1
    fi
else
    log "${BLUE}🔍 [DRY-RUN] Пропущено: npm run build${NC}"
fi

# Проверка и настройка файрвола
if [ "$DRY_RUN" = false ]; then
    log "${YELLOW}🔥 Проверка файрвола...${NC}"
    if command -v ufw &> /dev/null; then
        if ufw status | grep -q "8000/tcp"; then
            log "${GREEN}✅ Порт 8000 уже открыт в файрволе${NC}"
        else
            log "${YELLOW}🔓 Открытие порта 8000 в файрволе...${NC}"
            if sudo ufw allow 8000/tcp 2>/dev/null; then
                log "${GREEN}✅ Порт 8000 открыт в файрволе${NC}"
            else
                log "${YELLOW}⚠️  Не удалось открыть порт в файрволе (возможно, нет прав sudo)${NC}"
                log "${YELLOW}💡 Выполните вручную: sudo ufw allow 8000/tcp${NC}"
            fi
        fi
    else
        log "${BLUE}ℹ️  ufw не установлен, пропущено${NC}"
    fi
else
    log "${BLUE}🔍 [DRY-RUN] Пропущено: проверка файрвола${NC}"
fi

# Проверка и исправление конфигурации systemd
if [ "$DRY_RUN" = false ]; then
    SYSTEMD_FILE="/etc/systemd/system/deepseek-web-client.service"
    if [ -f "$SYSTEMD_FILE" ]; then
        log "${YELLOW}🔍 Проверка конфигурации systemd...${NC}"
        
        # Проверяем, что сервис слушает на 0.0.0.0
        if grep -q "ExecStart" "$SYSTEMD_FILE"; then
            if grep "ExecStart" "$SYSTEMD_FILE" | grep -q "0.0.0.0"; then
                log "${GREEN}✅ Сервис настроен на прослушивание 0.0.0.0:8000${NC}"
            else
                log "${YELLOW}⚠️  Сервис не слушает на 0.0.0.0, исправление...${NC}"
                
                # Создаем резервную копию
                sudo cp "$SYSTEMD_FILE" "${SYSTEMD_FILE}.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
                
                # Исправляем конфигурацию
                if sudo sed -i 's/--host [0-9.]*/--host 0.0.0.0/g' "$SYSTEMD_FILE" 2>/dev/null || \
                   sudo sed -i 's/uvicorn main:app/uvicorn main:app --host 0.0.0.0/g' "$SYSTEMD_FILE" 2>/dev/null; then
                    log "${GREEN}✅ Конфигурация исправлена${NC}"
                    log "${YELLOW}🔄 Перезагрузка systemd...${NC}"
                    sudo systemctl daemon-reload 2>/dev/null || true
                else
                    log "${YELLOW}⚠️  Не удалось автоматически исправить конфигурацию${NC}"
                    log "${YELLOW}💡 Отредактируйте вручную: sudo nano $SYSTEMD_FILE${NC}"
                    log "${YELLOW}💡 Убедитесь, что ExecStart содержит: --host 0.0.0.0 --port 8000${NC}"
                fi
            fi
        fi
    else
        log "${BLUE}ℹ️  Файл systemd не найден: $SYSTEMD_FILE${NC}"
        log "${YELLOW}💡 Создайте файл сервиса (см. DEPLOY.md)${NC}"
    fi
else
    log "${BLUE}🔍 [DRY-RUN] Пропущено: проверка конфигурации systemd${NC}"
fi

# Перезапуск systemd сервиса (если используется)
if [ "$DRY_RUN" = false ]; then
    if [ -f "/etc/systemd/system/deepseek-web-client.service" ]; then
        log "${YELLOW}🔄 Перезапуск сервиса deepseek-web-client...${NC}"
        if sudo systemctl restart deepseek-web-client 2>/dev/null; then
            sleep 3
            if systemctl is-active --quiet deepseek-web-client 2>/dev/null; then
                log "${GREEN}✅ Сервис перезапущен и работает${NC}"
                
                # Проверка, что порт слушается
                sleep 1
                if netstat -tuln 2>/dev/null | grep -q ":8000 " || ss -tuln 2>/dev/null | grep -q ":8000 "; then
                    log "${GREEN}✅ Порт 8000 слушается${NC}"
                    
                    # Проверка, что слушается на 0.0.0.0
                    if netstat -tuln 2>/dev/null | grep ":8000 " | grep -q "0.0.0.0" || \
                       ss -tuln 2>/dev/null | grep ":8000 " | grep -q "0.0.0.0"; then
                        log "${GREEN}✅ Сервис слушает на 0.0.0.0:8000 (доступен извне)${NC}"
                    else
                        log "${YELLOW}⚠️  Сервис слушает только на localhost${NC}"
                        log "${YELLOW}💡 Проверьте конфигурацию systemd${NC}"
                    fi
                else
                    log "${YELLOW}⚠️  Порт 8000 не слушается${NC}"
                fi
                
                # Проверка health endpoint
                sleep 1
                if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null | grep -q "200"; then
                    log "${GREEN}✅ Health endpoint отвечает${NC}"
                else
                    log "${YELLOW}⚠️  Health endpoint не отвечает${NC}"
                fi
            else
                log "${RED}❌ Сервис не запустился после перезапуска${NC}"
                log "${YELLOW}💡 Проверьте логи: sudo journalctl -u deepseek-web-client -n 50${NC}"
            fi
        else
            log "${YELLOW}⚠️  Не удалось перезапустить сервис (возможно, нет прав sudo)${NC}"
            log "${YELLOW}💡 Попробуйте вручную: sudo systemctl restart deepseek-web-client${NC}"
        fi
    else
        log "${BLUE}ℹ️  Сервис deepseek-web-client не установлен${NC}"
        log "${YELLOW}💡 Создайте файл сервиса (см. DEPLOY.md, Шаг 6)${NC}"
    fi
else
    log "${BLUE}🔍 [DRY-RUN] Пропущено: перезапуск сервисов${NC}"
fi

# Финальная информация
log ""
log "${GREEN}════════════════════════════════════════${NC}"
log "${GREEN}✨ Деплой завершен успешно!${NC}"
log "${GREEN}════════════════════════════════════════${NC}"
log "${BLUE}📋 Информация:${NC}"
log "   - Версия: $(git rev-parse --short HEAD 2>/dev/null || echo 'неизвестна')"
log "   - Лог файл: $LOG_FILE"
if [ "$DRY_RUN" = false ]; then
    log "   - Бэкап: $BACKUP_DIR (если создан)"
fi
log "${GREEN}🌐 Сайт должен быть доступен по адресу вашего сервера${NC}"
log ""
log "${BLUE}📋 Проверка доступности:${NC}"
log "   - Локально: curl http://localhost:8000/api/health"
log "   - Извне: http://ваш-ip:8000"
log ""
log "${YELLOW}💡 Если сайт недоступен извне:${NC}"
log "   1. Проверьте облачный файрвол (AWS, DigitalOcean и т.д.)"
log "   2. Убедитесь, что порт 8000 открыт для входящих соединений"
log "   3. Запустите диагностику: ./diagnose_server.sh"
log ""

