# Интеграция MCP-Weather сервера

## Текущее состояние

В проекте уже реализована полная интеграция с MCP-Weather сервером:

- ✅ **Бэкенд**: `backend/services/mcp_client.py` - поддержка HTTP и stdio подключений
- ✅ **Роутер**: `backend/routers/weather_chat.py` - обработка запросов о погоде
- ✅ **Фронтенд**: `frontend/WeatherChat.tsx` - интерфейс для чата о погоде
- ✅ **API**: `/api/weather-chat` - эндпоинт для запросов о погоде
- ✅ **MCP Tools**: `/api/mcp/list-tools/mcp-weather` - просмотр доступных инструментов

## Варианты подключения

### Вариант 1: HTTP подключение (рекомендуется для удаленного сервера)

Если ваш MCP-Weather сервер запущен как HTTP сервер (используя `server_remote.py`):

1. **Запустите ваш MCP-Weather сервер**:
   ```bash
   cd /path/to/MCP-Weather
   python3 server_remote.py
   ```
   
   Сервер должен быть доступен по адресу, например: `http://localhost:8001` или `http://ваш-ip:8001`

2. **Настройте переменные окружения** в файле `.env`:
   ```env
   MCP_WEATHER_SERVER_URL=http://localhost:8001
   MCP_USE_HTTP=true
   ```
   
   Или для удаленного сервера:
   ```env
   MCP_WEATHER_SERVER_URL=http://185.28.85.26:8001
   MCP_USE_HTTP=true
   ```

3. **Перезапустите FastAPI сервер**:
   ```bash
   npm run dev
   ```

4. **Проверьте подключение**:
   ```bash
   # Проверить список инструментов
   curl http://localhost:8000/api/mcp/list-tools/mcp-weather
   
   # Или через веб-интерфейс
   # Откройте: http://localhost:8000/mcp-server
   # Введите: mcp-weather
   ```

### Вариант 2: Локальное stdio подключение

Если вы хотите использовать локальный MCP-Weather сервер через stdio (используя `server.py`):

1. **Установите MCP-Weather сервер локально**:
   ```bash
   git clone https://github.com/AlexDevyatov/MCP-Weather.git
   cd MCP-Weather
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Настройте переменные окружения** в файле `.env`:
   ```env
   MCP_USE_HTTP=false
   ```

3. **Убедитесь, что сервер доступен в PATH** или укажите полный путь:
   
   В `backend/services/mcp_client.py` функция `_resolve_mcp_server_command` автоматически ищет сервер в стандартных местах:
   - `~/MCP-Weather/server.py`
   - `~/.local/share/mcp-weather/server.py`
   - `/opt/mcp-weather/server.py`
   
   Или убедитесь, что команда `python3 /path/to/MCP-Weather/server.py` работает.

4. **Перезапустите FastAPI сервер**:
   ```bash
   npm run dev
   ```

## Использование

### Через веб-интерфейс

1. Откройте: http://localhost:8000/weather-chat
2. Задайте вопрос о погоде, например:
   - "Какая погода в Москве?"
   - "Прогноз погоды в Санкт-Петербурге на 5 дней"
   - "Температура в Новосибирске"

### Через API

```bash
curl -X POST "http://localhost:8000/api/weather-chat" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Какая погода в Москве?",
    "temperature": 0.3
  }'
```

### Просмотр доступных инструментов

```bash
# Список инструментов MCP-Weather сервера
curl http://localhost:8000/api/mcp/list-tools/mcp-weather

# Или через веб-интерфейс
# http://localhost:8000/mcp-server
```

## Доступные инструменты MCP-Weather

Согласно документации вашего сервера, доступны следующие инструменты:

1. **`get_current_weather`** - Текущая погода
   - Параметры: `location` (string), `lat` (number), `lon` (number)

2. **`get_weather_forecast`** - Прогноз погоды
   - Параметры: `days` (integer, 1-7), `location` (string), `lat` (number), `lon` (number)

3. **`search_location`** - Поиск координат по названию города
   - Параметры: `city_name` (string, обязательный)

## Отладка

### Проверка подключения к HTTP серверу

```bash
# Проверить доступность сервера
curl http://localhost:8001

# Проверить JSON-RPC endpoint
curl -X POST http://localhost:8001 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

### Проверка логов

```bash
# Логи FastAPI сервера
# Смотрите вывод в консоли, где запущен npm run dev

# Или если используете systemd:
sudo journalctl -u deepseek-web-client -f
```

### Типичные проблемы

1. **Сервер не найден**:
   - Проверьте, что MCP-Weather сервер запущен
   - Проверьте URL в `.env` файле
   - Проверьте доступность порта (firewall, сеть)

2. **Ошибка подключения**:
   - Убедитесь, что `MCP_USE_HTTP=true` для HTTP подключения
   - Проверьте формат URL (должен начинаться с `http://`)

3. **Инструменты не вызываются**:
   - Проверьте логи на наличие ошибок
   - Убедитесь, что сервер поддерживает JSON-RPC 2.0 протокол
   - Проверьте формат ответов сервера

## Дополнительная информация

- **Репозиторий MCP-Weather**: https://github.com/AlexDevyatov/MCP-Weather
- **Документация MCP**: https://modelcontextprotocol.io/
- **Open-Meteo API**: https://open-meteo.com/ (используется MCP-Weather сервером)
