#!/bin/bash
# Проверка MCP сервера на порту 9001 через curl (JSON-RPC)
# Запуск: ./test_mcp_9001_curl.sh [URL]
# Пример: ./test_mcp_9001_curl.sh http://127.0.0.1:9001

MCP_URL="${1:-http://185.28.85.26:9001}"
BODY_LIST='{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
BODY_CALL='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_current_weather","arguments":{"location":"Moscow"}}}'
HEADERS=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")

echo "=== MCP server: $MCP_URL ==="
echo ""

echo "1. POST $MCP_URL (tools/list) — корневой URL"
echo "---------------------------------------------"
curl -s -w "\nHTTP_CODE:%{http_code}" "${HEADERS[@]}" -d "$BODY_LIST" "$MCP_URL"
echo -e "\n"

echo "2. POST $MCP_URL/messages/ (tools/list) — endpoint /messages/"
echo "-----------------------------------------------------------"
curl -s -w "\nHTTP_CODE:%{http_code}" "${HEADERS[@]}" -d "$BODY_LIST" "$MCP_URL/messages/"
echo -e "\n"

echo "3. POST $MCP_URL (tools/call get_current_weather)"
echo "--------------------------------------------------"
curl -s -w "\nHTTP_CODE:%{http_code}" "${HEADERS[@]}" -d "$BODY_CALL" "$MCP_URL"
echo -e "\n"

echo "Done. HTTP_CODE: 200 = успех, 000 = сервер недоступен (connection refused)."
echo "На сервере запустите: ./test_mcp_9001_curl.sh http://127.0.0.1:9001"
