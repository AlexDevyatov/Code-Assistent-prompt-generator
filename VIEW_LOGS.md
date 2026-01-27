# Как смотреть логи приложения

## 1. В терминале (основной способ)

Когда вы запускаете приложение через `npm run dev`, логи выводятся прямо в терминал.

### Просмотр всех логов:
```bash
npm run dev
```

Вы увидите вывод от:
- **Vite** (фронтенд) - обычно серые/белые сообщения
- **uvicorn** (бэкенд) - обычно зеленые/белые сообщения с префиксом `INFO:`

### Фильтрация логов MCP:

Если вы используете терминал, который поддерживает фильтрацию (например, iTerm2, Terminal.app), вы можете фильтровать вывод:

**В macOS Terminal:**
- Нажмите `Cmd+F` для поиска
- Введите `mcp` или `MCP` для поиска всех сообщений, связанных с MCP

**Или используйте grep для фильтрации:**
```bash
npm run dev 2>&1 | grep -i "mcp\|google-search"
```

## 2. Увеличение уровня логирования

Для более детальных логов MCP, вы можете временно изменить уровень логирования в `backend/main.py`:

```python
logging.basicConfig(
    level=logging.DEBUG,  # Вместо INFO
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

Или для конкретного модуля MCP:

```python
# В backend/services/mcp_client.py или backend/routers/mcp.py
logger.setLevel(logging.DEBUG)
```

## 3. Просмотр логов через файл

Если вы хотите сохранять логи в файл, добавьте в `backend/main.py`:

```python
import logging
from logging.handlers import RotatingFileHandler

# Настройка логирования в файл
file_handler = RotatingFileHandler('app.log', maxBytes=10485760, backupCount=5)
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[file_handler, logging.StreamHandler()]
)
```

Затем просматривайте логи:
```bash
tail -f app.log | grep -i mcp
```

## 4. Что искать в логах MCP

При попытке подключения к MCP серверу вы должны увидеть:

```
INFO - backend.services.mcp_client - Resolving MCP server 'mcp-server-google-search': found command = /opt/homebrew/bin/google-search-mcp
INFO - backend.services.mcp_client - Using resolved binary: /opt/homebrew/bin/google-search-mcp
```

Или если используется npx:
```
INFO - backend.services.mcp_client - Binary not found, will use npx fallback for mcp-server-google-search
```

Если есть ошибки:
```
ERROR - backend.services.mcp_client - Error listing tools from MCP server mcp-server-google-search: ...
```

## 5. Быстрая проверка через curl

Вы также можете проверить работу MCP через API и посмотреть ответ:

```bash
curl -X GET "http://localhost:8000/api/mcp/list-tools/mcp-server-google-search" | python3 -m json.tool
```

Если есть ошибка, она будет в JSON ответе в поле `error`.

## 6. Просмотр логов в реальном времени

Для просмотра логов в реальном времени с фильтрацией:

```bash
# В отдельном терминале
tail -f /path/to/logfile.log | grep -i mcp
```

Или если логи выводятся в консоль, используйте `tee`:

```bash
npm run dev 2>&1 | tee app.log | grep -i mcp
```

Это сохранит все логи в файл `app.log` и покажет только MCP-связанные сообщения в консоли.
