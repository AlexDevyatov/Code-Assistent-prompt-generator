#!/bin/bash
# Скрипт для тестирования MCP endpoints

echo "Testing MCP endpoint..."
echo ""

# Тест GET запроса
echo "1. Testing GET /api/mcp/list-tools/mcp-server-google-search"
response=$(curl -s -X GET "http://localhost:8000/api/mcp/list-tools/mcp-server-google-search")
echo "Response:"
echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
echo ""

# Тест POST запроса
echo "2. Testing POST /api/mcp/list-tools"
response=$(curl -s -X POST "http://localhost:8000/api/mcp/list-tools" \
  -H "Content-Type: application/json" \
  -d '{"server_name": "mcp-server-google-search"}')
echo "Response:"
echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
echo ""

# Проверка OpenAPI
echo "3. Checking if MCP routes are registered in OpenAPI"
mcp_paths=$(curl -s "http://localhost:8000/openapi.json" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    mcp_paths = {k: list(v.keys()) for k, v in data.get('paths', {}).items() if 'mcp' in k.lower()}
    print(json.dumps(mcp_paths, indent=2) if mcp_paths else 'No MCP paths found')
except Exception as e:
    print(f'Error: {e}')
" 2>&1)
echo "$mcp_paths"
