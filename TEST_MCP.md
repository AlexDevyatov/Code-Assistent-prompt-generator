# Инструкция по тестированию MCP

## Важно: Сервер должен быть запущен!

Перед тестированием убедитесь, что сервер запущен:

```bash
npm run dev
```

Сервер должен быть доступен на `http://localhost:8000`

## Тестирование MCP endpoint

### 1. Быстрый тест через curl:

```bash
curl -X GET "http://localhost:8000/api/mcp/list-tools/mcp-server-google-search" | python3 -m json.tool
```

### 2. Использование тестового скрипта:

```bash
./test_mcp.sh
```

### 3. Проверка через браузер:

Откройте: `http://localhost:8000/docs` и найдите endpoint `/api/mcp/list-tools/{server_name}`

## Ожидаемый результат

При успешной работе вы должны получить JSON с информацией о сервере и его инструментах:

```json
{
    "name": "mcp-server-google-search",
    "tools": [
        {
            "name": "search",
            "description": "...",
            "inputSchema": {...}
        }
    ]
}
```

## Если получаете ошибку

1. **404 Not Found** - Роутер не зарегистрирован. Перезапустите сервер.
2. **Server not found** - MCP сервер не установлен. Установите через: `npm install -g @mcp-server/google-search-mcp`
3. **Connection refused** - Сервер не запущен. Запустите через `npm run dev`

## Отладка

Проверьте логи сервера в терминале, где запущен `npm run dev`. Вы должны увидеть:
- `MCP router imported: /api/mcp, routes: 2`
- `MCP router registered with prefix: /api/mcp`
- При запросе: `Listing tools from MCP server: mcp-server-google-search`
