#!/bin/bash

# Быстрое исправление проблемы с отсутствующим uvicorn
# Использование: ./quick_fix_uvicorn.sh

set -e

PROJECT_DIR="${PROJECT_DIR:-/opt/Code-Assistent-prompt-generator}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Если дефолтная директория не существует, используем директорию скрипта
if [ ! -d "$PROJECT_DIR" ]; then
    PROJECT_DIR="$SCRIPT_DIR"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}🔧 Быстрое исправление uvicorn${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# Проверка директории проекта
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ Директория проекта не найдена: $PROJECT_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Директория проекта: $PROJECT_DIR${NC}"
cd "$PROJECT_DIR"
echo ""

# Проверка requirements.txt
if [ ! -f "requirements.txt" ]; then
    echo -e "${RED}❌ requirements.txt не найден${NC}"
    exit 1
fi

# Функция для проверки, работает ли pip
check_pip_works() {
    local pip_path="$1"
    if [ ! -f "$pip_path" ]; then
        return 1
    fi
    # Пробуем выполнить pip и проверяем на ошибку "cannot execute"
    if ! "$pip_path" --version >/dev/null 2>&1; then
        return 1
    fi
    # Дополнительная проверка: пробуем выполнить и проверить stderr на "cannot execute"
    local error_output
    error_output=$("$pip_path" --version 2>&1 >/dev/null)
    if echo "$error_output" | grep -q "cannot execute\|required file not found"; then
        return 1
    fi
    return 0
}

# Создание/проверка виртуального окружения
echo -e "${YELLOW}1. Проверка виртуального окружения...${NC}"

VENV_PIP="$PROJECT_DIR/venv/bin/pip"
VENV_PYTHON="$PROJECT_DIR/venv/bin/python"

# Проверяем, нужно ли пересоздать venv
NEED_RECREATE=false

if [ ! -d "venv" ]; then
    echo -e "${YELLOW}   venv не найден, создаю...${NC}"
    NEED_RECREATE=true
elif [ ! -f "$VENV_PYTHON" ]; then
    echo -e "${YELLOW}   Python в venv не найден, пересоздаю...${NC}"
    NEED_RECREATE=true
elif [ ! -f "$VENV_PIP" ]; then
    echo -e "${YELLOW}   pip в venv не найден, пересоздаю...${NC}"
    NEED_RECREATE=true
elif ! check_pip_works "$VENV_PIP"; then
    echo -e "${YELLOW}   pip в venv не работает (возможно, venv создан на другой системе или поврежден), пересоздаю...${NC}"
    NEED_RECREATE=true
fi

if [ "$NEED_RECREATE" = true ]; then
    echo -e "${YELLOW}   Удаляю старый venv...${NC}"
    rm -rf venv
    echo -e "${YELLOW}   Создаю новый venv...${NC}"
    python3 -m venv venv
    VENV_PIP="$PROJECT_DIR/venv/bin/pip"
    VENV_PYTHON="$PROJECT_DIR/venv/bin/python"
    
    # Проверяем, что новый venv работает
    sleep 1  # Даем время на создание файлов
    if [ ! -f "$VENV_PIP" ] || ! check_pip_works "$VENV_PIP"; then
        echo -e "${RED}❌ ОШИБКА: Не удалось создать рабочий venv${NC}"
        echo -e "${YELLOW}Проверьте установку Python3 и python3-venv:${NC}"
        echo -e "   sudo apt install python3 python3-pip python3-venv"
        exit 1
    fi
    echo -e "${GREEN}✅ venv создан и работает${NC}"
else
    echo -e "${GREEN}✅ venv существует и работает${NC}"
fi
echo ""

# Установка зависимостей (используем явный путь к pip в venv)
echo -e "${YELLOW}2. Установка зависимостей...${NC}"

# Проверка наличия uvicorn
if [ ! -f "$PROJECT_DIR/venv/bin/uvicorn" ]; then
    echo -e "${YELLOW}   uvicorn не найден, устанавливаю зависимости...${NC}"
    # Используем явный путь к pip в venv
    # Проверяем еще раз перед использованием (на случай, если venv был поврежден)
    if ! check_pip_works "$VENV_PIP"; then
        echo -e "${YELLOW}   pip не работает, пересоздаю venv...${NC}"
        rm -rf venv
        python3 -m venv venv
        VENV_PIP="$PROJECT_DIR/venv/bin/pip"
        sleep 1
    fi
    
    if ! "$VENV_PIP" install --upgrade pip setuptools wheel 2>&1; then
        echo -e "${RED}❌ ОШИБКА: Не удалось обновить pip${NC}"
        echo -e "${YELLOW}Пересоздаю venv...${NC}"
        rm -rf venv
        python3 -m venv venv
        VENV_PIP="$PROJECT_DIR/venv/bin/pip"
        sleep 1
        if ! "$VENV_PIP" install --upgrade pip setuptools wheel 2>&1; then
            echo -e "${RED}❌ КРИТИЧЕСКАЯ ОШИБКА: Не удалось установить pip даже после пересоздания venv${NC}"
            echo -e "${YELLOW}Проверьте установку Python3:${NC}"
            echo -e "   python3 --version"
            echo -e "   sudo apt install python3 python3-pip python3-venv"
            exit 1
        fi
    fi
    if ! "$VENV_PIP" install -r requirements.txt 2>&1; then
        echo -e "${RED}❌ ОШИБКА: Не удалось установить зависимости${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Зависимости установлены${NC}"
else
    echo -e "${GREEN}✅ uvicorn уже установлен${NC}"
    # Все равно обновляем зависимости на случай изменений
    echo -e "${YELLOW}   Обновление зависимостей...${NC}"
    # Проверяем, что pip работает перед использованием
    if ! check_pip_works "$VENV_PIP"; then
        echo -e "${YELLOW}   pip не работает, пересоздаю venv...${NC}"
        rm -rf venv
        python3 -m venv venv
        VENV_PIP="$PROJECT_DIR/venv/bin/pip"
        sleep 1
        "$VENV_PIP" install --upgrade pip setuptools wheel
        "$VENV_PIP" install -r requirements.txt
    else
        if ! "$VENV_PIP" install --upgrade pip setuptools wheel --quiet 2>/dev/null; then
            echo -e "${YELLOW}   Предупреждение: не удалось обновить pip тихо, пробую с выводом...${NC}"
            "$VENV_PIP" install --upgrade pip setuptools wheel || true
        fi
        if ! "$VENV_PIP" install -r requirements.txt --quiet 2>/dev/null; then
            echo -e "${YELLOW}   Предупреждение: не удалось обновить зависимости тихо, пробую с выводом...${NC}"
            "$VENV_PIP" install -r requirements.txt
        fi
    fi
fi

# Проверка, что uvicorn теперь существует
if [ ! -f "$PROJECT_DIR/venv/bin/uvicorn" ]; then
    echo -e "${RED}❌ ОШИБКА: uvicorn все еще не найден после установки${NC}"
    echo -e "${YELLOW}Проверьте requirements.txt и установку pip${NC}"
    echo -e "${YELLOW}Попробуйте вручную:${NC}"
    echo -e "   $VENV_PIP install -r requirements.txt"
    exit 1
fi

# Убеждаемся, что uvicorn исполняемый
chmod +x "$PROJECT_DIR/venv/bin/uvicorn"

echo -e "${GREEN}✅ uvicorn найден: $PROJECT_DIR/venv/bin/uvicorn${NC}"
echo -e "${BLUE}   Версия: $($PROJECT_DIR/venv/bin/uvicorn --version 2>/dev/null || echo 'неизвестна')${NC}"
echo ""

# Проверка systemd сервиса
echo -e "${YELLOW}3. Проверка systemd сервиса...${NC}"
SYSTEMD_FILE="/etc/systemd/system/deepseek-web-client.service"

if [ -f "$SYSTEMD_FILE" ]; then
    echo -e "${GREEN}✅ Файл сервиса найден${NC}"
    
    # Проверяем, что путь в ExecStart правильный
    EXEC_START=$(grep "ExecStart" "$SYSTEMD_FILE" | head -1)
    UVICORN_PATH=$(echo "$EXEC_START" | sed -n 's/.*ExecStart=\([^ ]*\).*/\1/p')
    
    EXPECTED_PATH="$PROJECT_DIR/venv/bin/uvicorn"
    
    if [ "$UVICORN_PATH" != "$EXPECTED_PATH" ]; then
        echo -e "${YELLOW}   Обновление пути в systemd...${NC}"
        sudo sed -i "s|ExecStart=.*|ExecStart=$EXPECTED_PATH backend.main:app --host 0.0.0.0 --port 8000|g" "$SYSTEMD_FILE"
        sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=$PROJECT_DIR|g" "$SYSTEMD_FILE"
        sudo sed -i "s|Environment=\"PATH=.*|Environment=\"PATH=$PROJECT_DIR/venv/bin\"|g" "$SYSTEMD_FILE"
        echo -e "${GREEN}✅ Путь обновлен${NC}"
    else
        echo -e "${GREEN}✅ Путь в systemd правильный${NC}"
    fi
    
    echo -e "${BLUE}   Текущий ExecStart:${NC}"
    grep "ExecStart" "$SYSTEMD_FILE" | head -1
else
    echo -e "${YELLOW}⚠️  Файл сервиса не найден${NC}"
    echo -e "${YELLOW}   Создайте его вручную или запустите fix_service.sh${NC}"
fi
echo ""

# Перезагрузка systemd и перезапуск сервиса
if [ -f "$SYSTEMD_FILE" ]; then
    echo -e "${YELLOW}4. Перезагрузка systemd...${NC}"
    sudo systemctl daemon-reload
    echo -e "${GREEN}✅ systemd перезагружен${NC}"
    echo ""
    
    echo -e "${YELLOW}5. Перезапуск сервиса...${NC}"
    sudo systemctl stop deepseek-web-client 2>/dev/null || true
    sleep 1
    sudo systemctl start deepseek-web-client
    sleep 3
    echo ""
    
    echo -e "${YELLOW}6. Проверка статуса...${NC}"
    if systemctl is-active --quiet deepseek-web-client 2>/dev/null; then
        echo -e "${GREEN}✅ Сервис запущен успешно!${NC}"
        echo ""
        echo -e "${BLUE}Статус сервиса:${NC}"
        systemctl status deepseek-web-client --no-pager -l | head -15
        echo ""
        
        # Проверка порта
        if ss -tuln 2>/dev/null | grep -q ":8000 " || netstat -tuln 2>/dev/null | grep -q ":8000 "; then
            echo -e "${GREEN}✅ Порт 8000 слушается${NC}"
        fi
        
        # Проверка health endpoint
        sleep 2
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null | grep -q "200"; then
            echo -e "${GREEN}✅ Health endpoint отвечает${NC}"
        fi
    else
        echo -e "${RED}❌ Сервис не запустился${NC}"
        echo -e "${YELLOW}Последние логи:${NC}"
        sudo journalctl -u deepseek-web-client -n 20 --no-pager 2>/dev/null || true
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Исправление завершено!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Полезные команды:${NC}"
echo -e "   Статус: sudo systemctl status deepseek-web-client"
echo -e "   Логи:   sudo journalctl -u deepseek-web-client -f"
echo -e "   Проверка: curl http://localhost:8000/api/health"
echo ""
