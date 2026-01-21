#!/bin/bash

# Тест наращивания промптов через curl

BASE_URL="http://localhost:8000"
TEST_PROMPT="Напиши краткий рассказ о программировании"

echo "=== Тест наращивания промптов ==="
echo ""

# Проверка здоровья сервера
echo "1. Проверка здоровья сервера..."
HEALTH=$(curl -s "$BASE_URL/api/health")
if [ $? -eq 0 ]; then
    echo "✓ Сервер работает"
    echo ""
else
    echo "✗ Сервер не доступен. Запустите сервер: python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000"
    exit 1
fi

# Тест короткого запроса (исходный промпт)
echo "2. Тест короткого запроса (исходный промпт)..."
SHORT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\": \"$TEST_PROMPT\", \"max_tokens\": 100}")

if echo "$SHORT_RESPONSE" | grep -q "response"; then
    echo "✓ Короткий запрос успешен"
    SHORT_TOKENS=$(echo "$SHORT_RESPONSE" | grep -o '"prompt_tokens":[0-9]*' | grep -o '[0-9]*')
    echo "  Prompt tokens: $SHORT_TOKENS"
else
    echo "✗ Ошибка в коротком запросе: $SHORT_RESPONSE"
fi
echo ""

# Тест длинного запроса (наращенный промпт)
# Для теста создадим длинный промпт (~8000 токенов)
echo "3. Тест длинного запроса (наращенный промпт ~8000 токенов)..."
# Создаем длинный промпт путем повторения и расширения
LONG_PROMPT_BASE="Напиши подробный рассказ о программировании. "
LONG_PROMPT=""
for i in {1..200}; do
    LONG_PROMPT+="$LONG_PROMPT_BASE Расскажи о языках программирования. Опиши различные парадигмы. "
done
LONG_PROMPT+="$TEST_PROMPT"

LONG_RESPONSE=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\": \"$LONG_PROMPT\", \"max_tokens\": 100}")

if echo "$LONG_RESPONSE" | grep -q "response"; then
    echo "✓ Длинный запрос успешен"
    LONG_TOKENS=$(echo "$LONG_RESPONSE" | grep -o '"prompt_tokens":[0-9]*' | grep -o '[0-9]*')
    echo "  Prompt tokens: $LONG_TOKENS"
else
    echo "✗ Ошибка в длинном запросе: $LONG_RESPONSE"
fi
echo ""

# Тест лимитного запроса (наращенный промпт ~30000 токенов)
echo "4. Тест лимитного запроса (наращенный промпт ~30000 токенов)..."
LIMIT_PROMPT=""
for i in {1..800}; do
    LIMIT_PROMPT+="$LONG_PROMPT_BASE Расскажи о языках программирования. Опиши различные парадигмы. Детально рассмотри основы. "
done
LIMIT_PROMPT+="$TEST_PROMPT"

LIMIT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\": \"$LIMIT_PROMPT\", \"max_tokens\": 100}")

if echo "$LIMIT_RESPONSE" | grep -q "response"; then
    echo "✓ Лимитный запрос успешен"
    LIMIT_TOKENS=$(echo "$LIMIT_RESPONSE" | grep -o '"prompt_tokens":[0-9]*' | grep -o '[0-9]*')
    echo "  Prompt tokens: $LIMIT_TOKENS"
else
    echo "✗ Ошибка в лимитном запросе: $LIMIT_RESPONSE"
    echo "  Ответ: $LIMIT_RESPONSE"
fi
echo ""

echo "=== Тест завершен ==="

