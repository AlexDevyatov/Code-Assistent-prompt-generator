#!/bin/bash
# Исправление и перезапуск systemd-сервиса deepseek-web-client.
# Использование:
#   ./fix_service.sh              — полная проверка и исправление
#   ./fix_service.sh --restart-only — только daemon-reload и перезапуск (для update.sh)

set -e

SYSTEMD_FILE="/etc/systemd/system/deepseek-web-client.service"
PROJECT_DIR="${PROJECT_DIR:-/opt/Code-Assistent-prompt-generator}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Если дефолтная директория не существует (запуск не на сервере), используем директорию скрипта
if [ ! -d "$PROJECT_DIR" ]; then
    PROJECT_DIR="$SCRIPT_DIR"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

RESTART_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --restart-only) RESTART_ONLY=true ;;
        --help|-h)
            echo "Usage: $0 [--restart-only]"
            echo "  --restart-only  только daemon-reload и перезапуск сервиса (все проверки через sudo)"
            exit 0
            ;;
    esac
done

# Все проверки systemd и доступа к /etc — через sudo
service_exists() {
    sudo test -f "$SYSTEMD_FILE" 2>/dev/null
}
service_is_active() {
    sudo systemctl is-active --quiet deepseek-web-client 2>/dev/null
}

do_restart_only() {
    if ! service_exists; then
        echo -e "${BLUE}ℹ️  Юнит не установлен: $SYSTEMD_FILE${NC}"
        return 1
    fi
    echo -e "${YELLOW}Перезапуск сервиса deepseek-web-client...${NC}"
    sudo systemctl daemon-reload
    sudo systemctl restart deepseek-web-client
    sleep 3
    if service_is_active; then
        echo -e "${GREEN}✅ Сервис перезапущен и работает${NC}"
        return 0
    else
        echo -e "${RED}❌ Сервис не запустился${NC}"
        echo -e "${YELLOW}Последние логи:${NC}"
        sudo journalctl -u deepseek-web-client -n 20 --no-pager 2>/dev/null || true
        return 1
    fi
}

if [ "$RESTART_ONLY" = true ]; then
    do_restart_only
    exit $?
fi

# ─── Полный цикл исправления ─────────────────────────────────────────────────
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}🔧 Исправление systemd-сервиса deepseek-web-client${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}1. Директория проекта${NC}"
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ Не найдена: $PROJECT_DIR${NC}"
    exit 1
fi
echo -e "${GREEN}✅ $PROJECT_DIR${NC}"
cd "$PROJECT_DIR"
echo ""

echo -e "${YELLOW}2. Виртуальное окружение${NC}"
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}   Создаю venv...${NC}"
    python3 -m venv venv
fi
echo -e "${GREEN}✅ venv${NC}"
echo ""

echo -e "${YELLOW}3. Зависимости и uvicorn${NC}"
VENV_PIP="$PROJECT_DIR/venv/bin/pip"
VENV_PYTHON="$PROJECT_DIR/venv/bin/python"

# Проверяем, что venv/bin/python существует
if [ ! -f "$VENV_PYTHON" ]; then
    echo -e "${YELLOW}   Пересоздаю venv (Python не найден)...${NC}"
    rm -rf venv
    python3 -m venv venv
    VENV_PIP="$PROJECT_DIR/venv/bin/pip"
    VENV_PYTHON="$PROJECT_DIR/venv/bin/python"
fi

if [ ! -f "venv/bin/uvicorn" ]; then
    echo -e "${YELLOW}   Устанавливаю зависимости...${NC}"
    # Используем явный путь к pip в venv, чтобы избежать проблем с externally-managed-environment
    "$VENV_PIP" install --upgrade pip setuptools wheel --quiet 2>/dev/null || "$VENV_PIP" install --upgrade pip setuptools wheel
    "$VENV_PIP" install -r requirements.txt --quiet 2>/dev/null || "$VENV_PIP" install -r requirements.txt
fi
[ -x "venv/bin/uvicorn" ] || chmod +x venv/bin/uvicorn
echo -e "${GREEN}✅ uvicorn${NC}"
echo ""

echo -e "${YELLOW}4. backend/main.py${NC}"
if [ ! -f "backend/main.py" ]; then
    echo -e "${RED}❌ backend/main.py не найден${NC}"
    exit 1
fi
echo -e "${GREEN}✅ backend/main.py${NC}"
echo ""

echo -e "${YELLOW}5. Конфигурация systemd${NC}"
SERVICE_USER="$(whoami)"
[ "$SERVICE_USER" = "root" ] && SERVICE_USER="www-data"

if ! service_exists; then
    echo -e "${YELLOW}   Создаю юнит $SYSTEMD_FILE${NC}"
    sudo tee "$SYSTEMD_FILE" > /dev/null <<EOF
[Unit]
Description=DeepSeek Web Client API
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$PROJECT_DIR/venv/bin"
Environment="SUMMARIES_DB_DIR=$PROJECT_DIR/data"
ExecStart=$PROJECT_DIR/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    echo -e "${GREEN}✅ Юнит создан${NC}"
else
    echo -e "${YELLOW}   Обновляю пути в юните...${NC}"
    sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=$PROJECT_DIR|g" "$SYSTEMD_FILE"
    sudo sed -i "s|ExecStart=.*|ExecStart=$PROJECT_DIR/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000|g" "$SYSTEMD_FILE"
    sudo sed -i "s|Environment=\"PATH=.*|Environment=\"PATH=$PROJECT_DIR/venv/bin\"|g" "$SYSTEMD_FILE"
    if sudo grep -q 'SUMMARIES_DB_DIR' "$SYSTEMD_FILE" 2>/dev/null; then
        sudo sed -i "s|Environment=\"SUMMARIES_DB_DIR=.*|Environment=\"SUMMARIES_DB_DIR=$PROJECT_DIR/data\"|g" "$SYSTEMD_FILE"
    else
        sudo sed -i "/Environment=\"PATH=/a Environment=\"SUMMARIES_DB_DIR=$PROJECT_DIR/data\"" "$SYSTEMD_FILE"
    fi
    echo -e "${GREEN}✅ Юнит обновлён${NC}"
fi
echo -e "${BLUE}   WorkingDirectory:${NC}"
sudo grep "WorkingDirectory" "$SYSTEMD_FILE" | head -1
echo -e "${BLUE}   ExecStart:${NC}"
sudo grep "ExecStart" "$SYSTEMD_FILE" | head -1
echo ""

echo -e "${YELLOW}6. systemd daemon-reload${NC}"
sudo systemctl daemon-reload
echo -e "${GREEN}✅ daemon-reload${NC}"
echo ""

echo -e "${YELLOW}7. Права доступа и каталог для БД суммаризаций${NC}"
SERVICE_USER="$(sudo grep "^User=" "$SYSTEMD_FILE" | cut -d'=' -f2)"
if [ -n "$SERVICE_USER" ]; then
    sudo mkdir -p "$PROJECT_DIR/data"
    sudo chown "$SERVICE_USER:$SERVICE_USER" "$PROJECT_DIR/data"
    if ! sudo -u "$SERVICE_USER" test -r "$PROJECT_DIR/backend/main.py" 2>/dev/null; then
        echo -e "${YELLOW}   Выставляю владельца $SERVICE_USER для $PROJECT_DIR${NC}"
        sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$PROJECT_DIR" 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ Пользователь сервиса: $SERVICE_USER, каталог $PROJECT_DIR/data создан${NC}"
fi
echo ""

echo -e "${YELLOW}8. Запуск сервиса${NC}"
sudo systemctl stop deepseek-web-client 2>/dev/null || true
sleep 1
sudo systemctl start deepseek-web-client
sleep 3
echo ""

echo -e "${YELLOW}9. Проверка${NC}"
if service_is_active; then
    echo -e "${GREEN}✅ Сервис запущен${NC}"
    if ss -tuln 2>/dev/null | grep -q ":8000 " || netstat -tuln 2>/dev/null | grep -q ":8000 "; then
        echo -e "${GREEN}✅ Порт 8000 слушается${NC}"
    fi
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null | grep -q "200"; then
        echo -e "${GREEN}✅ /api/health отвечает 200${NC}"
    fi
else
    echo -e "${RED}❌ Сервис не запустился${NC}"
    echo -e "${YELLOW}Логи:${NC}"
    sudo journalctl -u deepseek-web-client -n 15 --no-pager 2>/dev/null || true
    exit 1
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Готово${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "   Статус: sudo systemctl status deepseek-web-client"
echo -e "   Логи:   sudo journalctl -u deepseek-web-client -f"
echo ""
