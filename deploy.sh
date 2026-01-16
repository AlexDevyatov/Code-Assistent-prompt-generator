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

# Перезапуск systemd сервиса (если используется)
if [ "$DRY_RUN" = false ]; then
    if systemctl is-active --quiet deepseek-web-client 2>/dev/null; then
        log "${YELLOW}🔄 Перезапуск сервиса deepseek-web-client...${NC}"
        if sudo systemctl restart deepseek-web-client; then
            sleep 2
            if systemctl is-active --quiet deepseek-web-client; then
                log "${GREEN}✅ Сервис перезапущен и работает${NC}"
            else
                log "${RED}❌ Сервис не запустился после перезапуска${NC}"
                log "${YELLOW}💡 Попробуйте: sudo systemctl status deepseek-web-client${NC}"
            fi
        else
            log "${YELLOW}⚠️  Предупреждение: не удалось перезапустить сервис (возможно, нет прав sudo)${NC}"
        fi
    else
        log "${BLUE}ℹ️  Сервис deepseek-web-client не активен или не установлен${NC}"
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

