# Инструкция по разворачиванию на сервере

## Требования

- Ubuntu 20.04+ / Debian 11+ (или другой Linux дистрибутив)
- Python 3.9+
- Node.js 18+ и npm
- Nginx (опционально, для проксирования)
- SSL сертификат (опционально, для HTTPS)

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

## Шаг 7: Настройка Nginx (рекомендуется)

### Установка Nginx

```bash
sudo apt install nginx -y
```

### Создание конфигурации

```bash
sudo nano /etc/nginx/sites-available/deepseek-web-client
```

Добавьте следующую конфигурацию:

```nginx
server {
    listen 80;
    server_name ваш-домен.com;  # Замените на ваш домен или IP

    # Максимальный размер тела запроса (для больших промптов)
    client_max_body_size 10M;

    # Проксирование API запросов на FastAPI
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты для долгих запросов
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Отдача статических файлов фронтенда
    location / {
        root /opt/deepseek-web-client/static;
        try_files $uri $uri/ /index.html;
        index index.html;
        
        # Кэширование статических ресурсов
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

Активируйте конфигурацию:

```bash
# Создайте символическую ссылку
sudo ln -s /etc/nginx/sites-available/deepseek-web-client /etc/nginx/sites-enabled/

# Проверьте конфигурацию
sudo nginx -t

# Перезагрузите Nginx
sudo systemctl reload nginx
```

## Шаг 8: Настройка SSL (опционально, но рекомендуется)

### Использование Let's Encrypt (Certbot)

```bash
# Установите Certbot
sudo apt install certbot python3-certbot-nginx -y

# Получите сертификат
sudo certbot --nginx -d ваш-домен.com

# Настройте автообновление
sudo certbot renew --dry-run
```

Certbot автоматически обновит конфигурацию Nginx для использования HTTPS.

## Шаг 9: Настройка файрвола

```bash
# Разрешите HTTP и HTTPS
sudo ufw allow 'Nginx Full'
# или отдельно:
sudo ufw allow 'Nginx HTTP'
sudo ufw allow 'Nginx HTTPS'

# Если используете напрямую без Nginx:
sudo ufw allow 8000/tcp

# Включите файрвол
sudo ufw enable
```

## Шаг 10: Проверка работы

1. Откройте браузер и перейдите на `http://ваш-домен.com` или `http://ваш-ip`
2. Проверьте, что интерфейс загружается
3. Отправьте тестовый запрос
4. Проверьте логи:

```bash
# Логи systemd сервиса
sudo journalctl -u deepseek-web-client -f

# Логи Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

## Обновление приложения

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

### Nginx возвращает 502 Bad Gateway

- Убедитесь, что FastAPI сервис запущен: `sudo systemctl status deepseek-web-client`
- Проверьте, что в Nginx конфигурации правильный адрес: `proxy_pass http://127.0.0.1:8000`
- Проверьте логи Nginx: `sudo tail -f /var/log/nginx/error.log`

### Статические файлы не загружаются

- Убедитесь, что папка `static/` существует и содержит файлы
- Проверьте права доступа: `sudo chown -R www-data:www-data /opt/deepseek-web-client/static`
- Проверьте путь в Nginx конфигурации

### API запросы не работают

- Проверьте, что переменная окружения `DEEPSEEK_API_KEY` установлена
- Проверьте логи FastAPI: `sudo journalctl -u deepseek-web-client -f`
- Убедитесь, что проксирование настроено правильно в Nginx

## Безопасность

1. **Не коммитьте `.env` файл** - он уже в `.gitignore`
2. **Используйте HTTPS** - настройте SSL сертификат
3. **Ограничьте доступ** - используйте файрвол для ограничения доступа к порту 8000
4. **Регулярно обновляйте** - обновляйте зависимости и систему
5. **Используйте сильные пароли** - если добавляете аутентификацию

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

2. Настроить кэширование в Nginx
3. Использовать CDN для статических файлов
4. Настроить мониторинг (например, с помощью Prometheus + Grafana)

