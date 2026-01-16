# Инструкция по разворачиванию на сервере

## Требования

- Ubuntu 20.04+ / Debian 11+ (или другой Linux дистрибутив)
- Python 3.9+
- Node.js 18+ и npm

## Шаг 1: Подготовка сервера

### Обновление системы

```bash
sudo apt update && sudo apt upgrade -y
```

### Установка Python и pip

```bash
sudo apt install python3 python3-pip python3-venv -y
```

### Установка Node.js и npm

```bash
# Используя NodeSource репозиторий
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка версий
node --version
npm --version
```

## Шаг 2: Клонирование проекта

```bash
# Перейдите в директорию для проектов
cd /opt  # или /var/www, или любая другая

# Клонируйте репозиторий
sudo git clone <ваш-репозиторий> deepseek-web-client
cd deepseek-web-client

# Установите права доступа
sudo chown -R $USER:$USER /opt/deepseek-web-client
```

## Шаг 3: Установка зависимостей

### Python зависимости

```bash
# Создайте виртуальное окружение
python3 -m venv venv

# Активируйте виртуальное окружение
source venv/bin/activate

# Установите зависимости
pip install -r requirements.txt
```

### Node.js зависимости

```bash
# Установите зависимости
npm install
```

## Шаг 4: Настройка переменных окружения

```bash
# Создайте файл .env
nano .env
```

Добавьте в файл:

```env
DEEPSEEK_API_KEY=ваш-api-ключ-от-deepseek
```

Сохраните файл (Ctrl+O, Enter, Ctrl+X).

## Шаг 5: Сборка фронтенда

```bash
# Соберите фронтенд для продакшена
npm run build
```

Это создаст папку `static/` с собранными файлами.

## Шаг 6: Настройка systemd сервиса

Создайте systemd unit файл для автоматического запуска бэкенда:

```bash
sudo nano /etc/systemd/system/deepseek-web-client.service
```

Добавьте следующее содержимое (замените пути на ваши):

```ini
[Unit]
Description=DeepSeek Web Client API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/deepseek-web-client
Environment="PATH=/opt/deepseek-web-client/venv/bin"
ExecStart=/opt/deepseek-web-client/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Важно:** Замените:
- `User=www-data` на вашего пользователя (или оставьте www-data)
- `/opt/deepseek-web-client` на путь к вашему проекту

Активируйте и запустите сервис:

```bash
# Перезагрузите systemd
sudo systemctl daemon-reload

# Включите автозапуск
sudo systemctl enable deepseek-web-client

# Запустите сервис
sudo systemctl start deepseek-web-client

# Проверьте статус
sudo systemctl status deepseek-web-client
```

## Шаг 7: Проверка работы

1. Откройте браузер и перейдите на `http://ваш-ip:8000`
2. Проверьте, что интерфейс загружается
3. Отправьте тестовый запрос
4. Проверьте логи:

```bash
# Логи systemd сервиса
sudo journalctl -u deepseek-web-client -f
```

## Обновление приложения

### Автоматическое обновление (рекомендуется)

Используйте скрипт `deploy.sh` для автоматического обновления:

```bash
cd /opt/deepseek-web-client

# Базовое использование
./deploy.sh

# С параметрами
./deploy.sh --skip-git      # Пропустить git pull
./deploy.sh --skip-deps     # Пропустить обновление зависимостей
./deploy.sh --dry-run       # Проверка без применения изменений
```

Скрипт автоматически:
- ✅ Получает последние изменения из git
- ✅ Обновляет Node.js и Python зависимости
- ✅ Создает бэкап статики перед сборкой
- ✅ Собирает фронтенд
- ✅ Перезапускает systemd сервис
- ✅ Проверяет статус сервисов
- ✅ Создает лог файл в `logs/deploy_YYYYMMDD_HHMMSS.log`

### Ручное обновление

Если нужно обновить вручную:

```bash
cd /opt/deepseek-web-client

# Получите последние изменения
git pull

# Обновите зависимости (если нужно)
source venv/bin/activate
pip install -r requirements.txt
npm install

# Пересоберите фронтенд
npm run build

# Перезапустите сервис
sudo systemctl restart deepseek-web-client
```

## Устранение неполадок

### Сервис не запускается

```bash
# Проверьте логи
sudo journalctl -u deepseek-web-client -n 50

# Проверьте, что порт 8000 свободен
sudo netstat -tulpn | grep 8000

# Проверьте права доступа к файлам
ls -la /opt/deepseek-web-client
```

### Статические файлы не загружаются

- Убедитесь, что папка `static/` существует и содержит файлы
- Проверьте права доступа: `sudo chown -R www-data:www-data /opt/deepseek-web-client/static`

### API запросы не работают

- Проверьте, что переменная окружения `DEEPSEEK_API_KEY` установлена
- Проверьте логи FastAPI: `sudo journalctl -u deepseek-web-client -f`
- Убедитесь, что сервис слушает на правильном порту (8000)

## Безопасность

1. **Не коммитьте `.env` файл** - он уже в `.gitignore`
2. **Регулярно обновляйте** - обновляйте зависимости и систему
3. **Используйте сильные пароли** - если добавляете аутентификацию
4. **Ограничьте доступ** - настройте доступ к порту 8000 только для нужных IP адресов

## Производительность

Для улучшения производительности можно:

1. Использовать Gunicorn вместо uvicorn (для production):
   ```bash
   pip install gunicorn
   ```
   И изменить ExecStart в systemd:
   ```ini
   ExecStart=/opt/deepseek-web-client/venv/bin/gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
   ```

2. Использовать CDN для статических файлов
3. Настроить мониторинг (например, с помощью Prometheus + Grafana)


