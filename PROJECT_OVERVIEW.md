# DeepSeek Web Client - Краткий обзор проекта

## Описание проекта

**DeepSeek Web Client** — веб-приложение для работы с DeepSeek API, предоставляющее набор инструментов для тестирования и сравнения различных подходов к генерации текста с помощью ИИ.

### Основные функции

1. **Генератор промптов** (`/chat`) — создание структурированных промптов для Cursor AI
2. **Сравнение способов рассуждения** (`/reasoning`) — сравнение 6+ методов решения задач (прямой ответ, пошаговое, эксперты, промпт-инжиниринг)
3. **Тестирование System Prompt** (`/system-prompt`) — тестирование реакций агента при изменении System Prompt
4. **Сравнение температур** (`/temperature`) — сравнение результатов с температурами 0, 0.7, 1.2, 2 по точности, креативности и разнообразию

## Технологический стек

### Backend
- **Python 3.9+**
- **FastAPI** — веб-фреймворк (асинхронный)
- **Uvicorn** — ASGI сервер
- **httpx** — HTTP клиент для DeepSeek API
- **pydantic** — валидация данных
- **python-dotenv** — управление переменными окружения

### Frontend
- **React 18.2** — UI библиотека
- **TypeScript** — типизированный JavaScript
- **Vite** — сборщик и dev-сервер
- **React Router 7** — маршрутизация
- **KaTeX** — отображение математических формул (LaTeX)

### Инфраструктура
- **Git** — контроль версий
- **npm** — менеджер пакетов Node.js
- **pip** — менеджер пакетов Python

## Архитектура

```
Frontend (React) → Backend (FastAPI) → DeepSeek API
```

- **Монорепозиторий** — backend и frontend в одном репозитории
- **SPA (Single Page Application)** — React приложение с клиентской маршрутизацией
- **REST API** — FastAPI предоставляет REST endpoints
- **Streaming** — поддержка Server-Sent Events для потоковой передачи ответов

## Структура проекта

```
DeepseekWebClient/
├── backend/              # FastAPI приложение
│   ├── main.py          # Точка входа, настройка CORS, статика
│   ├── config.py        # Конфигурация (API ключи, MAX_TOKENS)
│   ├── routers/         # API роутеры
│   │   ├── chat.py      # POST /api/chat, POST /api/chat/stream
│   │   └── health.py     # GET /api/health
│   ├── services/        # Бизнес-логика
│   │   └── deepseek_api.py  # Вызовы DeepSeek API
│   └── constants/       # Системные промпты
│       └── prompts.py
│
├── frontend/            # React приложение
│   ├── App.tsx         # Главный компонент, роутинг
│   ├── Home.tsx        # Главная страница (навигация)
│   ├── Chat.tsx        # Генератор промптов
│   ├── ReasoningComparison.tsx  # Сравнение рассуждений
│   ├── SystemPromptTest.tsx     # Тестирование System Prompt
│   └── TemperatureComparison.tsx # Сравнение температур
│
└── static/             # Собранный frontend (npm run build)
```

## API Endpoints

### POST /api/chat
Обычный endpoint для получения ответа.
```json
{
  "prompt": "string",
  "system_prompt": "string (optional)",
  "temperature": 0.7 (optional),
  "max_tokens": 1000 (optional)
}
```

### POST /api/chat/stream
Streaming endpoint (Server-Sent Events) для получения ответа по частям.
Те же параметры, что и `/api/chat`.

### GET /api/health
Health check endpoint.

## Ключевые особенности

### Backend
- **Асинхронность** — все операции асинхронные (async/await)
- **Валидация** — Pydantic модели для валидации запросов
- **Логирование** — структурированное логирование всех операций
- **CORS** — настроен для работы с frontend
- **Статика** — автоматическая отдача собранного frontend

### Frontend
- **TypeScript** — полная типизация
- **React Hooks** — useState, useRef для управления состоянием
- **Streaming** — обработка Server-Sent Events для реального времени
- **LaTeX поддержка** — отображение математических формул через KaTeX
- **Адаптивный дизайн** — поддержка мобильных устройств

### Специфические функции
- **Параллельная обработка** — несколько запросов одновременно
- **Защита от race conditions** — использование requestId для отслеживания актуальных запросов
- **Ограничение токенов** — настраиваемый max_tokens для разных страниц
- **Очистка контекста** — полная очистка при каждом новом запросе

## Конфигурация

### Переменные окружения (.env)
```env
DEEPSEEK_API_KEY=sk-...  # Обязательно
MAX_TOKENS=1000          # Опционально, по умолчанию 1000
```

### Запуск
```bash
# Разработка (frontend + backend)
npm run dev

# Продакшен (только backend после сборки)
npm run build
uvicorn backend.main:app --reload
```

## Основные паттерны

1. **Монорепозиторий** — один репозиторий для всего проекта
2. **Разделение ответственности** — routers, services, constants
3. **Типизация** — TypeScript на frontend, Pydantic на backend
4. **Streaming** — для длинных ответов используется SSE
5. **Обработка ошибок** — try/catch с логированием
6. **Валидация** — проверка данных на входе (Pydantic)

## Зависимости

### Python (requirements.txt)
- fastapi==0.104.1
- uvicorn[standard]==0.24.0
- httpx==0.25.2
- python-dotenv==1.0.0
- pydantic>=2.0.0

### Node.js (package.json)
- react ^18.2.0
- react-dom ^18.2.0
- react-router-dom ^7.12.0
- katex ^0.16.27
- react-katex ^3.1.0
- vite ^5.0.8
- typescript ^5.3.3

## Документация

- **DOCS.md** — полная документация проекта
- **README.md** — быстрый старт
- **DEPLOY.md** — инструкция по развертыванию

---

Все созданные файлы добавляй в git.
После каждого промпта выполняй команду commit

**Версия:** 1.0  
**Последнее обновление:** 2024

