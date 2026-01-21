#!/bin/bash

# Скрипт для тестирования наращивания промпта через curl
# Использует API ключ из .env

set -e

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Читаем API ключ из .env
ENV_FILE="/Users/alexdevyatov/PycharmProjects/DeepseekWebClient/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env file not found"
    exit 1
fi

DEEPSEEK_API_KEY=$(grep DEEPSEEK_API_KEY "$ENV_FILE" | cut -d'=' -f2)
if [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "Error: DEEPSEEK_API_KEY not found in .env"
    exit 1
fi

API_URL="https://api.deepseek.com/v1/chat/completions"
LOCAL_API_URL="http://localhost:8000/api/chat"

# Базовый промпт для тестирования
BASE_PROMPT="Напиши функцию для обработки массива чисел"

echo -e "${BLUE}=== Тест наращивания промпта через curl ===${NC}\n"

# Функция для оценки токенов (приблизительно)
estimate_tokens() {
    local text="$1"
    local by_chars=$(echo "$text" | wc -c)
    local by_words=$(echo "$text" | wc -w)
    local tokens_chars=$((by_chars / 4))
    local tokens_words=$((by_words * 130 / 100))
    if [ $tokens_chars -gt $tokens_words ]; then
        echo $tokens_chars
    else
        echo $tokens_words
    fi
}

# Функция для экранирования JSON
escape_json() {
    echo "$1" | jq -Rs .
}

# Функция для отправки запроса через локальный API
send_request_local() {
    local prompt="$1"
    local max_tokens="${2:-2000}"
    
    local escaped_prompt=$(echo "$prompt" | jq -Rs .)
    
    curl -s -X POST "$LOCAL_API_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"prompt\": $escaped_prompt,
            \"temperature\": 0.3,
            \"max_tokens\": $max_tokens
        }"
}

# Функция для отправки запроса напрямую в DeepSeek API
send_request_direct() {
    local prompt_content="$1"
    local max_tokens="${2:-2000}"
    
    local escaped_content=$(echo "$prompt_content" | jq -Rs .)
    local messages_json=$(jq -n --arg content "$prompt_content" '[{role: "user", content: $content}]')
    
    curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
        -d "{
            \"model\": \"deepseek-chat\",
            \"messages\": $messages_json,
            \"temperature\": 0.3,
            \"max_tokens\": $max_tokens
        }"
}

# Проверяем, работает ли локальный сервер
echo -e "${YELLOW}Проверка локального сервера...${NC}"
if curl -s -f "$LOCAL_API_URL/../health" > /dev/null 2>&1; then
    USE_LOCAL=true
    echo -e "${GREEN}Локальный сервер доступен, используем его${NC}\n"
else
    USE_LOCAL=false
    echo -e "${YELLOW}Локальный сервер недоступен, используем прямой API${NC}\n"
fi

# Шаг 1: Первый запрос - развернуть базовый промпт
echo -e "${BLUE}Шаг 1: Разворачиваем базовый промпт...${NC}"
FIRST_INSTRUCTION="Разверни следующий промпт значительно подробнее, добавив структуры, критерии, детали, примеры и ограничения. Верни ТОЛЬКО итоговый промпт без пояснений.

$BASE_PROMPT"

if [ "$USE_LOCAL" = true ]; then
    FIRST_RESPONSE=$(send_request_local "$FIRST_INSTRUCTION" 2000)
    FIRST_PROMPT=$(echo "$FIRST_RESPONSE" | jq -r '.response // .' 2>/dev/null || echo "$FIRST_RESPONSE")
else
    FIRST_RESPONSE=$(send_request_direct "$FIRST_INSTRUCTION" 2000)
    FIRST_PROMPT=$(echo "$FIRST_RESPONSE" | jq -r '.choices[0].message.content // .' 2>/dev/null || echo "$FIRST_RESPONSE")
fi

if [ -z "$FIRST_PROMPT" ] || [ "$FIRST_PROMPT" = "null" ] || [ "$FIRST_PROMPT" = "{}" ]; then
    echo -e "${YELLOW}Ошибка при получении первого ответа${NC}"
    echo "Ответ: $FIRST_RESPONSE"
    exit 1
fi

FIRST_TOKENS=$(estimate_tokens "$FIRST_PROMPT")
echo -e "${GREEN}✓ Получен промпт (~$FIRST_TOKENS токенов)${NC}"
echo -e "${YELLOW}Начало промпта: ${FIRST_PROMPT:0:100}...${NC}\n"

# Шаг 2: Итеративное наращивание
TARGET_TOKENS=8000
CURRENT_PROMPT="$FIRST_PROMPT"
MAX_ITERATIONS=5

for i in $(seq 1 $MAX_ITERATIONS); do
    CURRENT_TOKENS=$(estimate_tokens "$CURRENT_PROMPT")
    
    if [ $CURRENT_TOKENS -ge $TARGET_TOKENS ]; then
        echo -e "${GREEN}✓ Достигнута цель: $CURRENT_TOKENS >= $TARGET_TOKENS токенов${NC}"
        break
    fi
    
    echo -e "${BLUE}Шаг $((i+1)): Наращиваем промпт ($CURRENT_TOKENS / $TARGET_TOKENS токенов)...${NC}"
    
    CONTINUE_INSTRUCTION="Продолжи РАСШИРЯТЬ и УТОЧНЯТЬ промпт ниже, добавляя больше деталей, примеров, edge-cases, критериев качества, входных/выходных форматов. Верни ТОЛЬКО ДОПОЛНЕНИЕ, которое нужно ПРИБАВИТЬ в конец (без вступления/заголовков).

$CURRENT_PROMPT"

    if [ "$USE_LOCAL" = true ]; then
        ADDITION_RESPONSE=$(send_request_local "$CONTINUE_INSTRUCTION" 2000)
        ADDITION=$(echo "$ADDITION_RESPONSE" | jq -r '.response // .' 2>/dev/null || echo "$ADDITION_RESPONSE")
    else
        ADDITION_RESPONSE=$(send_request_direct "$CONTINUE_INSTRUCTION" 2000)
        ADDITION=$(echo "$ADDITION_RESPONSE" | jq -r '.choices[0].message.content // .' 2>/dev/null || echo "$ADDITION_RESPONSE")
    fi
    
    if [ -z "$ADDITION" ] || [ "$ADDITION" = "null" ] || [ "$ADDITION" = "{}" ]; then
        echo -e "${YELLOW}Ошибка при получении дополнения на итерации $i${NC}"
        echo "Ответ: $ADDITION_RESPONSE"
        break
    fi
    
    CURRENT_PROMPT="$CURRENT_PROMPT

$ADDITION"
    NEW_TOKENS=$(estimate_tokens "$CURRENT_PROMPT")
    
    echo -e "${GREEN}✓ Добавлено (~$NEW_TOKENS токенов всего)${NC}"
    echo -e "${YELLOW}Добавленный фрагмент: ${ADDITION:0:80}...${NC}\n"
    
    # Небольшая задержка между запросами
    sleep 1
done

FINAL_TOKENS=$(estimate_tokens "$CURRENT_PROMPT")
echo -e "${BLUE}=== Результаты ===${NC}"
echo -e "Базовый промпт: ${BASE_PROMPT:0:50}..."
echo -e "Итоговый промпт: ~$FINAL_TOKENS токенов"
echo -e "Длина: $(echo -n "$CURRENT_PROMPT" | wc -c) символов"
echo -e "${GREEN}✓ Тест наращивания завершен${NC}\n"

# Сохраняем итоговый промпт в файл
OUTPUT_FILE="/tmp/increment_test_result.txt"
echo "$CURRENT_PROMPT" > "$OUTPUT_FILE"
echo -e "${YELLOW}Итоговый промпт сохранен в: $OUTPUT_FILE${NC}"

