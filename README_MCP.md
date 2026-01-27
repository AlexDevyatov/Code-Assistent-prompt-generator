# Интеграция MCP серверов - Быстрый старт

Этот проект включает интеграцию с серверами Model Context Protocol (MCP), позволяя подключаться к различным MCP серверам и просматривать доступные инструменты.

## Быстрая установка

### 1. Установка MCP сервера

Используйте предоставленный скрипт установки:

```bash
# Установить Google Search сервер (рекомендуется)
./install_mcp_server.sh mcp-server-google-search

# Или установить filesystem сервер
./install_mcp_server.sh mcp-server-filesystem
```

**Примечание:** Официального пакета `mcp-server-http` не существует. По умолчанию используется `mcp-server-google-search`.

Скрипт установки автоматически:
- Установит пакет через npm
- Добавит npm global bin в PATH для текущей сессии
- Покажет инструкции для постоянной настройки PATH

### 2. Настройка PATH (опционально, для постоянной работы)

Для постоянной настройки добавьте в `~/.zshrc` (или `~/.bashrc`):

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```

Или выполните:
```bash
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 3. Перезапуск приложения

```bash
npm run dev
```

### 4. Доступ к MCP интерфейсу

Откройте браузер и перейдите по адресу:
- **Веб-интерфейс**: http://localhost:8000/mcp-server
- **API Endpoint**: http://localhost:8000/api/mcp/list-tools/mcp-server-google-search

## Доступные MCP серверы

Поддерживаются следующие MCP серверы:

- **mcp-server-google-search** - Интеграция с Google Search (`@mcp-server/google-search-mcp`)
- **mcp-server-filesystem** - Операции с файловой системой (`@modelcontextprotocol/server-filesystem`)

**Примечание:** Официального пакета `mcp-server-http` не существует. Вы можете создать свой MCP сервер используя `@modelcontextprotocol/sdk` или использовать другие доступные серверы.

Установка любого из них:
```bash
./install_mcp_server.sh <имя-сервера>
```

## Использование API

### Получение списка инструментов от MCP сервера

**POST запрос:**
```bash
curl -X POST "http://localhost:8000/api/mcp/list-tools" \
  -H "Content-Type: application/json" \
  -d '{"server_name": "mcp-server-google-search"}'
```

**GET запрос:**
```bash
curl -X GET "http://localhost:8000/api/mcp/list-tools/mcp-server-google-search"
```

### Формат ответа

**Успешный ответ:**
```json
{
  "name": "mcp-server-google-search",
  "tools": [
    {
      "name": "google_search",
      "description": "Выполнить поиск в Google",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Поисковый запрос"
          }
        }
      }
    }
  ]
}
```

**Ошибка (сервер не найден):**
```json
{
  "name": "mcp-server-google-search",
  "error": "Server 'mcp-server-google-search' not found. Make sure it's installed and available in PATH.\n\nTo install MCP servers, you can:\n1. Install via npm: npm install -g @mcp-server/google-search-mcp\n2. Or use npx to run without installation: npx -y @mcp-server/google-search-mcp\n...",
  "tools": []
}
```

## Автоматическая поддержка npx

Приложение автоматически использует `npx` для запуска MCP серверов, если бинарник не найден в PATH. Это означает, что даже если пакет установлен, но бинарник недоступен напрямую, приложение попытается запустить сервер через `npx -y <package-name>`.

## Устранение неполадок

### Сервер не найден

Если вы получаете ошибку "Server not found":

1. **Проверьте, установлен ли сервер:**
   ```bash
   which mcp-server-google-search
   ```

2. **Установите сервер:**
   ```bash
   ./install_mcp_server.sh mcp-server-google-search
   ```

3. **Проверьте, что npm global bin в PATH:**
   ```bash
   npm config get prefix
   export PATH="$(npm config get prefix)/bin:$PATH"
   ```

4. **Проверьте, доступен ли npx:**
   ```bash
   which npx
   ```
   
   Приложение автоматически использует npx, если бинарник не найден.

### Роуты не найдены (404/405)

Если API endpoints возвращают 404 или 405:

1. **Перезапустите сервер:**
   ```bash
   npm run dev
   ```

2. **Проверьте, что роуты зарегистрированы:**
   ```bash
   curl -s "http://localhost:8000/openapi.json" | python3 -m json.tool | grep mcp
   ```

   Должны быть видны:
   - `/api/mcp/list-tools`
   - `/api/mcp/list-tools/{server_name}`

### Проблемы с npx

Если npx не работает:

1. **Проверьте установку Node.js:**
   ```bash
   node --version
   npm --version
   ```

2. **Установите/обновите Node.js:**
   - macOS: `brew install node`
   - Linux: следуйте инструкциям на https://nodejs.org/

## Документация

- **MCP_SETUP.md** - Подробная настройка и конфигурация
- **MCP_TESTING.md** - Руководство по тестированию и примеры
- **test_mcp_curl.sh** - Скрипт для автоматического тестирования

## Требования

- **Node.js** и **npm** (для установки MCP серверов)
- **Python 3.9+** (Python 3.10+ рекомендуется для MCP SDK)
- **FastAPI** сервер должен быть запущен

## Возможности

✅ Автоматическая fallback реализация (работает без MCP SDK)  
✅ Поддержка нескольких MCP серверов  
✅ Веб-интерфейс для просмотра инструментов  
✅ REST API для программного доступа  
✅ Подробные сообщения об ошибках с инструкциями по установке  
✅ Скрипт установки для простой настройки  
✅ Автоматическое использование npx, если бинарник не найден  
✅ Автоматическое добавление npm global bin в PATH  

## Примеры использования

### Через веб-интерфейс

1. Откройте http://localhost:8000/mcp-server
2. Введите имя сервера (например, `mcp-server-google-search`)
3. Нажмите "Подключиться"
4. Просмотрите список доступных инструментов

### Через API

```bash
# Получить список инструментов
curl -X GET "http://localhost:8000/api/mcp/list-tools/mcp-server-google-search" | python3 -m json.tool

# Использовать тестовый скрипт
./test_mcp_curl.sh
```

## Технические детали

### Как это работает

1. Приложение сначала пытается найти бинарник MCP сервера в PATH
2. Если бинарник не найден, автоматически используется `npx -y <package-name>`
3. Подключение к серверу происходит через stdio (стандартный ввод/вывод)
4. Используется JSON-RPC 2.0 протокол для общения с сервером
5. Если MCP SDK недоступен (Python < 3.10), используется fallback реализация

### Поддерживаемые протоколы

- **stdio** - Локальное подключение через стандартный ввод/вывод
- **npx** - Автоматический запуск через npx, если бинарник не найден

## Дополнительная информация

Для получения дополнительной информации о Model Context Protocol:
- Официальный сайт: https://modelcontextprotocol.io/
- Документация: https://modelcontextprotocol.io/docs
- Репозиторий серверов: https://github.com/modelcontextprotocol/servers
