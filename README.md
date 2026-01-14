# DeepSeek Web Client

Монорепозиторий веб-приложения для работы с DeepSeek API.

## Структура проекта

```
.
├── main.py              # FastAPI бэкенд
├── .env                 # Переменные окружения (API ключ)
├── .gitignore
├── requirements.txt     # Python зависимости
├── package.json         # Node.js зависимости
├── vite.config.js       # Конфигурация Vite
├── tsconfig.json        # TypeScript конфигурация
├── src/                 # Исходники React приложения
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── vite-env.d.ts
└── static/              # Собранный фронтенд (создаётся после npm run build)
```

## Установка

### 1. Python зависимости

```bash
pip install -r requirements.txt
```

### 2. Node.js зависимости

```bash
npm install
```

### 3. Настройка .env

Создайте файл `.env` в корне проекта и добавьте ваш API ключ:

```
DEEPSEEK_API_KEY=sk-24bc3d7bf4be4127862a23d007d2e3b7
```

Или скопируйте содержимое из `key.txt` в `.env`.

## Запуск

### Режим разработки

Запускает и фронтенд, и бэкенд одновременно:

```bash
npm run dev
```

- Фронтенд: http://localhost:5173
- Бэкенд: http://localhost:8000

### Сборка для продакшена

1. Соберите фронтенд:

```bash
npm run build
```

2. Запустите только бэкенд:

```bash
uvicorn main:app --reload
```

Приложение будет доступно по адресу http://localhost:8000

## Использование

1. Откройте приложение в браузере
2. Введите ваш промпт в текстовое поле
3. Нажмите "Отправить"
4. Дождитесь ответа от DeepSeek API

## API

### POST /api/chat

Отправляет запрос к DeepSeek API.

**Запрос:**
```json
{
  "prompt": "Ваш вопрос или запрос"
}
```

**Ответ:**
```json
{
  "response": "Ответ от DeepSeek API"
}
```

