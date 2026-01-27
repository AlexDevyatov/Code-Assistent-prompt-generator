#!/bin/bash
# Test script for MCP endpoints

BASE_URL="http://localhost:8000"

echo "Testing MCP endpoints..."
echo "======================"
echo ""

# Check if server is running
echo "0. Checking if server is running..."
echo "-----------------------------------"
health=$(curl -s "$BASE_URL/api/health" 2>&1)
if [ $? -eq 0 ] && echo "$health" | grep -q "ok"; then
    echo "✓ Server is running"
else
    echo "✗ Server is not responding. Please start the server first."
    exit 1
fi
echo ""

# Test 1: POST endpoint
echo "1. Testing POST /api/mcp/list-tools"
echo "-----------------------------------"
response=$(curl -s -X POST "$BASE_URL/api/mcp/list-tools" \
  -H "Content-Type: application/json" \
  -d '{"server_name": "mcp-server-google-search"}' \
  -w "\n%{http_code}")

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -n -1)

echo "HTTP Status: $http_code"
if [ "$http_code" = "200" ]; then
    echo "✓ Request successful"
    echo "Response:"
    echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
elif [ "$http_code" = "405" ] || [ "$http_code" = "404" ]; then
    echo "✗ Route not found. Server may need to be restarted to register new routes."
    echo "Response: $body"
else
    echo "Response:"
    echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
fi
echo ""

# Test 2: GET endpoint
echo "2. Testing GET /api/mcp/list-tools/mcp-server-google-search"
echo "-----------------------------------------------------------"
response=$(curl -s -X GET "$BASE_URL/api/mcp/list-tools/mcp-server-google-search" -w "\n%{http_code}")

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -n -1)

echo "HTTP Status: $http_code"
if [ "$http_code" = "200" ]; then
    echo "✓ Request successful"
    echo "Response:"
    echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
elif [ "$http_code" = "405" ] || [ "$http_code" = "404" ]; then
    echo "✗ Route not found. Server may need to be restarted to register new routes."
    echo "Response: $body"
else
    echo "Response:"
    echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
fi
echo ""

# Test 3: Check if routes are registered in OpenAPI
echo "3. Checking OpenAPI schema for MCP routes"
echo "-----------------------------------------"
openapi=$(curl -s "$BASE_URL/openapi.json" 2>&1)
if echo "$openapi" | python3 -m json.tool >/dev/null 2>&1; then
    routes=$(echo "$openapi" | python3 -c "import sys, json; data=json.load(sys.stdin); paths=[p for p in data.get('paths', {}).keys() if 'mcp' in p]; print('\n'.join(paths) if paths else 'No MCP routes found in OpenAPI schema')")
    if [ -n "$routes" ]; then
        echo "✓ MCP routes found in OpenAPI:"
        echo "$routes"
    else
        echo "✗ No MCP routes found. Server needs to be restarted."
    fi
else
    echo "✗ Could not fetch OpenAPI schema"
fi
echo ""

echo "======================"
echo "Tests completed!"
echo ""
echo "NOTE: If routes return 404/405, restart the server with:"
echo "  uvicorn backend.main:app --reload"
echo "  or"
echo "  npm run dev"
