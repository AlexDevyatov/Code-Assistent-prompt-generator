# Документация проекта DeepSeek Web Client

## Оглавление

1. [Обзор проекта](#обзор-проекта)
2. [Архитектура](#архитектура)
3. [Структура проекта](#структура-проекта)
4. [Установка и настройка](#установка-и-настройка)
5. [Запуск приложения](#запуск-приложения)
6. [Страницы приложения](#страницы-приложения)
7. [API Endpoints](#api-endpoints)
8. [Конфигурация](#конфигурация)
9. [Разработка](#разработка)
10. [Развертывание](#развертывание)

---

## Обзор проекта

**DeepSeek Web Client** — веб-приложение для работы с DeepSeek API, предоставляющее несколько инструментов для тестирования и сравнения различных подходов к генерации текста с помощью ИИ.

### Основные возможности

- **Генератор промптов** — создание точных и структурированных промптов для Cursor AI
- **Сравнение способов рассуждения** — сравнение разных методов решения задач с помощью ИИ
- **Тестирование System Prompt** — тестирование и сравнение реакций агента при изменении System Prompt в ходе диалога
- **Сравнение температур** — сравнение результатов с разными значениями температуры (0, 0.7, 1.2, 2) по точности, креативности и разнообразию

### Технологический стек

**Backend:**
- Python 3.9+
- FastAPI — веб-фреймворк
- Uvicorn — ASGI сервер
- httpx — HTTP клиент для работы с DeepSeek API
- python-dotenv — управление переменными окружения

**Frontend:**
- React 18.2
- TypeScript
- Vite — сборщик и dev-сервер
- React Router — маршрутизация
- KaTeX — отображение математических формул

---

## Архитектура

### Общая архитектура

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────────────────────────┐
│      FastAPI Backend            │
│  ┌──────────────────────────┐  │
│  │   Routers                │  │
│  │  - /api/chat             │  │
│  │  - /api/health           │  │
│  └──────────┬───────────────┘  │
│             │                   │
│  ┌──────────▼───────────────┐  │
│  │   Services               │  │
│  │  - deepseek_api.py       │  │
│  └──────────┬───────────────┘  │
└─────────────┼───────────────────┘
              │ HTTPS
              ▼
      ┌───────────────┐
      │ DeepSeek API  │
      └───────────────┘
```

### Поток данных

1. Пользователь отправляет запрос через React интерфейс
2. Frontend отправляет HTTP запрос к FastAPI backend
3. Backend обрабатывает запрос через роутеры
4. Сервисы вызывают DeepSeek API
5. Ответ возвращается через backend к frontend
6. React обновляет UI с результатами

---

## Структура проекта

```
DeepseekWebClient/
├── backend/                      # Backend приложение (FastAPI)
│   ├── __init__.py
│   ├── main.py                  # Главный файл приложения
│   ├── config.py                # Конфигурация (API ключи, настройки)
│   ├── routers/                 # API роутеры
│   │   ├── __init__.py
│   │   ├── chat.py              # Роутер для чата (основной API)
│   │   └── health.py            # Health check endpoint
│   ├── services/                # Бизнес-логика
│   │   ├── __init__.py
│   │   └── deepseek_api.py      # Сервис для работы с DeepSeek API
│   └── constants/               # Константы
│       ├── __init__.py
│       └── prompts.py           # Системные промпты
│
├── frontend/                     # Frontend приложение (React)
│   ├── App.tsx                  # Главный компонент с роутингом
│   ├── App.css                  # Стили для App
│   ├── main.tsx                 # Точка входа
│   ├── index.html               # HTML шаблон
│   ├── index.css                # Глобальные стили
│   ├── constants.ts             # Константы (промпты)
│   │
│   ├── Home.tsx                 # Главная страница
│   ├── Home.css                 # Стили главной страницы
│   │
│   ├── Chat.tsx                 # Страница генератора промптов
│   │
│   ├── ReasoningComparison.tsx  # Сравнение способов рассуждения
│   ├── ReasoningComparison.css  # Стили для сравнения рассуждений
│   │
│   ├── SystemPromptTest.tsx     # Тестирование System Prompt
│   ├── SystemPromptTest.css     # Стили для тестирования
│   │
│   ├── TemperatureComparison.tsx # Сравнение температур
│   └── TemperatureComparison.css # Стили для сравнения температур
│
├── static/                      # Собранный frontend (после npm run build)
│   └── assets/                  # Статические ресурсы
│
├── .env                         # Переменные окружения (не в git)
├── .gitignore                   # Игнорируемые файлы
│
├── requirements.txt             # Python зависимости
├── package.json                 # Node.js зависимости и скрипты
├── package-lock.json            # Зафиксированные версии npm пакетов
│
├── vite.config.js               # Конфигурация Vite
├── tsconfig.json                # Конфигурация TypeScript
├── tsconfig.node.json            # TypeScript конфигурация для Node
│
├── README.md                     # Основная документация
├── DOCS.md                       # Подробная документация (этот файл)
├── DEPLOY.md                     # Инструкция по развертыванию
│
└── deploy.sh                     # Скрипт развертывания
```

---

## Установка и настройка

### Требования

- **Python 3.9+**
- **Node.js 18+** и npm
- **API ключ DeepSeek** (получить на https://platform.deepseek.com/)

### Шаг 1: Клонирование репозитория

```bash
git clone <repository-url>
cd DeepseekWebClient
```

### Шаг 2: Установка Python зависимостей

```bash
pip install -r requirements.txt
```

Или с использованием виртуального окружения:

```bash
python3 -m venv venv
source venv/bin/activate  # На Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Шаг 3: Установка Node.js зависимостей

```bash
npm install
```

### Шаг 4: Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```bash
cp key.txt .env  # Если есть key.txt
# или создайте вручную
```

Содержимое `.env`:

```env
DEEPSEEK_API_KEY=sk-your-api-key-here
MAX_TOKENS=1000  # Опционально, по умолчанию 1000
```

**Важно:** Файл `.env` не должен попадать в git (уже в `.gitignore`).

---

## Запуск приложения

### Режим разработки

Запускает frontend (Vite) и backend (FastAPI) одновременно:

```bash
npm run dev
```

Это запустит:
- **Frontend:** http://localhost:5173 (Vite dev server)
- **Backend:** http://localhost:8000 (FastAPI)

Frontend автоматически проксирует запросы к backend.

### Сборка для продакшена

1. **Сборка frontend:**

```bash
npm run build
```

Это создаст папку `static/` с собранным frontend.

2. **Запуск только backend:**

```bash
uvicorn backend.main:app --reload
```

Приложение будет доступно по адресу http://localhost:8000

Backend автоматически отдает статические файлы из папки `static/`.

---

## Страницы приложения

### 1. Главная страница (`/`)

**Компонент:** `Home.tsx`

Навигационная страница со ссылками на все доступные инструменты:
- Генератор промптов
- Сравнение способов рассуждения
- День 5. System Prompt
- Сравнение температур

### 2. Генератор промптов (`/chat`)

**Компонент:** `Chat.tsx`

**Назначение:** Создание точных и структурированных промптов для Cursor AI.

**Функциональность:**
- Ввод задачи пользователем
- Отправка запроса к DeepSeek API с системным промптом
- Получение и отображение ответа с эффектом печати
- Копирование результата в буфер обмена
- Поддержка Ctrl+Enter для отправки

**API:** `POST /api/chat`

### 3. Сравнение способов рассуждения (`/reasoning`)

**Компонент:** `ReasoningComparison.tsx`

**Назначение:** Сравнение разных методов решения задач с помощью ИИ.

**Методы сравнения:**
1. **Прямой ответ** — обычный запрос к ИИ
2. **Пошаговое решение** — запрос с инструкцией решать пошагово
3. **Промпт от другого ИИ** — сначала генерируется промпт другим ИИ, затем используется для решения
4. **Эксперт 1 (Математик)** — запрос с системным промптом математика
5. **Эксперт 2 (Логик)** — запрос с системным промптом логика
6. **Эксперт 3 (Аналитик)** — запрос с системным промптом аналитика
7. **Сравнение и анализ ответов** — автоматический анализ всех методов

**Особенности:**
- Поддержка LaTeX формул (отображение через KaTeX)
- Параллельная обработка всех методов
- Streaming ответов для каждого метода
- Автоматический сравнительный анализ

**API:** `POST /api/chat/stream` для каждого метода

### 4. Тестирование System Prompt (`/system-prompt`)

**Компонент:** `SystemPromptTest.tsx`

**Назначение:** Тестирование и сравнение реакций агента при изменении System Prompt в ходе диалога.

**Функциональность:**
- Ввод начального System Prompt
- Ведение диалога с возможностью изменения System Prompt
- Сравнение реакций агента на разных этапах
- Отображение истории диалога

**API:** `POST /api/chat` и `POST /api/chat/stream`

### 5. Сравнение температур (`/temperature`)

**Компонент:** `TemperatureComparison.tsx`

**Назначение:** Сравнение результатов с разными значениями температуры (0, 0.7, 1.2, 2) по точности, креативности и разнообразию.

**Температуры:**
- **0** — Детерминированная (максимальная точность, минимальная креативность)
- **0.7** — Сбалансированная
- **1.2** — Креативная
- **2** — Максимально креативная

**Функциональность:**
- Отправка одного запроса с разными температурами параллельно
- Ограничение ответов до 500 токенов для быстрой генерации
- Автоматический анализ результатов по критериям:
  - **Точность** — корректность ответов
  - **Креативность** — оригинальность
  - **Разнообразие** — различия между ответами
- Полная очистка контекста при каждом новом запросе
- Защита от перезаписи результатов старыми запросами

**API:** `POST /api/chat/stream` для каждой температуры, `POST /api/chat` для анализа

**Ограничения:**
- `max_tokens: 500` для всех запросов на этой странице

---

## API Endpoints

### Base URL

В режиме разработки: `http://localhost:8000`
В продакшене: `https://your-domain.com`

### 1. POST /api/chat

Обычный endpoint для получения ответа от DeepSeek API.

**Запрос:**
```json
{
  "prompt": "Ваш вопрос или запрос",
  "system_prompt": "Опциональный системный промпт",
  "temperature": 0.7,  // Опционально, по умолчанию 0.3
  "max_tokens": 1000   // Опционально, по умолчанию из конфига
}
```

**Ответ:**
```json
{
  "response": "Ответ от DeepSeek API"
}
```

**Пример:**
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Опиши процесс фотосинтеза",
    "temperature": 0.7,
    "max_tokens": 500
  }'
```

### 2. POST /api/chat/stream

Streaming endpoint для получения ответа по частям (Server-Sent Events).

**Запрос:**
```json
{
  "prompt": "Ваш вопрос или запрос",
  "system_prompt": "Опциональный системный промпт",
  "temperature": 0.7,  // Опционально, по умолчанию 0.3
  "max_tokens": 1000   // Опционально, по умолчанию из конфига
}
```

**Ответ:**
Server-Sent Events поток:
```
data: {"content": "часть ответа 1"}

data: {"content": "часть ответа 2"}

data: {"content": "часть ответа 3"}

...
```

**Пример использования в JavaScript:**
```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Опиши процесс фотосинтеза',
    temperature: 0.7,
    max_tokens: 500
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      if (data.content) {
        console.log(data.content);
      }
    }
  }
}
```

### 3. GET /api/health

Health check endpoint для проверки состояния сервиса.

**Ответ:**
```json
{
  "status": "ok",
  "api_key_configured": true,
  "static_dir_exists": true
}
```

---

## Конфигурация

### Backend конфигурация (`backend/config.py`)

```python
# DeepSeek API настройки
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
API_KEY = os.getenv("DEEPSEEK_API_KEY")  # Из .env
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "1000"))  # По умолчанию 1000

# Настройки приложения
STATIC_DIR = Path("static")  # Папка со статическими файлами
```

### Переменные окружения (`.env`)

```env
# Обязательные
DEEPSEEK_API_KEY=sk-your-api-key-here

# Опциональные
MAX_TOKENS=1000  # Максимальное количество токенов по умолчанию
```

### Frontend конфигурация

**Vite** (`vite.config.js`):
- Настройки сборки и dev-сервера
- Прокси для API запросов (если нужно)

**TypeScript** (`tsconfig.json`):
- Настройки компиляции TypeScript
- Пути импортов

---

## Разработка

### Структура кода

#### Backend

**Роутеры** (`backend/routers/`):
- `chat.py` — основной роутер для чата
  - `ChatRequest` — модель запроса (Pydantic)
  - `chat()` — обычный endpoint
  - `chat_stream()` — streaming endpoint
  - `_prepare_messages()` — подготовка сообщений для API

**Сервисы** (`backend/services/`):
- `deepseek_api.py` — работа с DeepSeek API
  - `call_deepseek_api()` — обычный вызов API
  - `stream_deepseek_api()` — streaming вызов API

**Константы** (`backend/constants/`):
- `prompts.py` — системные промпты для разных сценариев

#### Frontend

**Компоненты:**
- Каждая страница — отдельный компонент
- Используется React Router для навигации
- Состояние управляется через React hooks (useState, useRef)

**Стили:**
- Отдельный CSS файл для каждой страницы
- Глобальные стили в `index.css`
- Адаптивный дизайн для мобильных устройств

### Добавление новой страницы

1. **Создайте компонент** в `frontend/`:
   ```typescript
   // frontend/NewPage.tsx
   import { Link } from 'react-router-dom'
   import './NewPage.css'
   
   function NewPage() {
     return (
       <div className="new-page">
         <div className="nav-bar">
           <Link to="/" className="nav-link">← На главную</Link>
         </div>
         {/* Ваш контент */}
       </div>
     )
   }
   
   export default NewPage
   ```

2. **Создайте стили** `frontend/NewPage.css`

3. **Добавьте маршрут** в `frontend/App.tsx`:
   ```typescript
   import NewPage from './NewPage'
   
   // В Routes:
   <Route path="/new-page" element={<NewPage />} />
   ```

4. **Добавьте ссылку** на главной странице `frontend/Home.tsx`

### Добавление нового API endpoint

1. **Создайте функцию** в `backend/routers/chat.py`:
   ```python
   @router.post("/new-endpoint")
   async def new_endpoint(request: ChatRequest):
       # Ваша логика
       return {"result": "success"}
   ```

2. **Используйте в frontend:**
   ```typescript
   const res = await fetch('/api/chat/new-endpoint', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ prompt: '...' })
   })
   ```

### Логирование

Backend использует стандартный Python logging:

```python
import logging
logger = logging.getLogger(__name__)

logger.info("Информационное сообщение")
logger.error("Ошибка", exc_info=True)
```

Логи выводятся в консоль с форматом:
```
2024-01-01 12:00:00 - backend.routers.chat - INFO - Received chat request
```

---

## Развертывание

Подробная инструкция по развертыванию находится в файле [DEPLOY.md](DEPLOY.md).

### Краткая инструкция

1. **Подготовка сервера:**
   - Установите Python 3.9+ и Node.js 18+
   - Клонируйте репозиторий

2. **Установка зависимостей:**
   ```bash
   pip install -r requirements.txt
   npm install
   ```

3. **Сборка frontend:**
   ```bash
   npm run build
   ```

4. **Настройка .env:**
   ```bash
   echo "DEEPSEEK_API_KEY=sk-your-key" > .env
   ```

5. **Запуск через systemd:**
   - Используйте скрипты из `deploy.sh`
   - Или настройте systemd service вручную

6. **Настройка Nginx** (опционально):
   - Проксирование на `http://localhost:8000`
   - SSL сертификаты через Let's Encrypt

---

## Часто задаваемые вопросы

### Как изменить системный промпт?

Системные промпты находятся в:
- `backend/constants/prompts.py` — для backend
- `frontend/constants.ts` — для frontend

### Как изменить максимальное количество токенов?

1. Глобально: установите `MAX_TOKENS` в `.env`
2. Для конкретного запроса: передайте `max_tokens` в API запросе

### Как добавить новую температуру в сравнение?

В `frontend/TemperatureComparison.tsx`:
1. Добавьте значение в массив `temperatures`
2. Обновите промпт анализа в `analyzeResults()`
3. Добавьте парсинг для новой температуры
4. Добавьте CSS стиль для бейджа

### Как отключить CORS?

В `backend/main.py` измените настройки CORS middleware:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Только конкретные домены
    ...
)
```

### Как изменить порт backend?

Используйте параметр `--port`:
```bash
uvicorn backend.main:app --reload --port 8080
```

Или измените в `package.json` скрипт `dev`.

---

## Поддержка и контакты

Для вопросов и предложений создайте issue в репозитории проекта.

---

**Версия документации:** 1.0  
**Последнее обновление:** 2024

