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
sudo git clone <ваш-репозиторий> Code-Assistent-prompt-generator
cd Code-Assistent-prompt-generator

# Установите права доступа
sudo chown -R $USER:$USER /opt/Code-Assistent-prompt-generator
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
WorkingDirectory=/opt/Code-Assistent-prompt-generator
Environment="PATH=/opt/Code-Assistent-prompt-generator/venv/bin"
ExecStart=/opt/Code-Assistent-prompt-generator/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Важно:** Замените:
- `User=www-data` на вашего пользователя (или оставьте www-data)
- `/opt/Code-Assistent-prompt-generator` на путь к вашему проекту (если отличается)

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

## Шаг 7: Отключение Nginx (если установлен)

**Важно:** Этот проект работает напрямую через FastAPI на порту 8000, **без использования Nginx**.

Если на сервере установлен Nginx и он мешает работе приложения, используйте скрипт:

```bash
cd /opt/Code-Assistent-prompt-generator
./disable_nginx.sh
```

Или выполните вручную:

```bash
# Остановите Nginx
sudo systemctl stop nginx

# Отключите автозапуск Nginx
sudo systemctl disable nginx

# Удалите конфигурацию для этого проекта (если есть)
sudo rm -f /etc/nginx/sites-enabled/deepseek-web-client
sudo rm -f /etc/nginx/sites-available/deepseek-web-client
```

**Примечание:** Если Nginx используется для других сервисов, просто удалите конфигурацию для этого проекта. Если Nginx не нужен вообще, можно удалить его полностью:
```bash
sudo apt remove nginx nginx-common -y
sudo apt autoremove -y
```

## Шаг 8: Проверка работы

1. Откройте браузер и перейдите на `http://ваш-ip:8000` (напрямую, без Nginx)
2. Проверьте, что интерфейс загружается
3. Отправьте тестовый запрос
4. Проверьте логи:

```bash
# Логи systemd сервиса
sudo journalctl -u deepseek-web-client -f

# Или проверьте health endpoint
curl http://localhost:8000/api/health
```

## Обновление приложения

### Автоматическое обновление (рекомендуется)

#### Быстрое обновление (update.sh)

Для быстрого применения изменений используйте `update.sh`:

```bash
cd /opt/Code-Assistent-prompt-generator

# Базовое использование (только обновление кода и перезапуск)
./update.sh

# Полное обновление (с проверкой конфигурации и файрвола)
./update.sh --full

# С параметрами
./update.sh --skip-git      # Пропустить git pull
./update.sh --skip-deps     # Пропустить обновление зависимостей
./update.sh --full --skip-deps  # Полное обновление без обновления зависимостей
```

Скрипт `update.sh` автоматически:
- ✅ Получает последние изменения из git
- ✅ Обновляет Node.js и Python зависимости
- ✅ Собирает фронтенд
- ✅ Перезапускает systemd сервис
- ✅ Проверяет работоспособность
- ✅ (с --full) Проверяет и исправляет конфигурацию systemd
- ✅ (с --full) Проверяет и открывает порт в файрволе

#### Полное развертывание (deploy.sh)

Для полного развертывания с логированием используйте `deploy.sh`:

```bash
cd /opt/Code-Assistent-prompt-generator

# Базовое использование
./deploy.sh

# С параметрами
./deploy.sh --skip-git      # Пропустить git pull
./deploy.sh --skip-deps     # Пропустить обновление зависимостей
./deploy.sh --dry-run       # Проверка без применения изменений
```

Скрипт `deploy.sh` автоматически:
- ✅ Получает последние изменения из git
- ✅ Обновляет Node.js и Python зависимости
- ✅ Создает бэкап статики перед сборкой
- ✅ Собирает фронтенд
- ✅ Проверяет и исправляет конфигурацию systemd
- ✅ Проверяет и открывает порт в файрволе
- ✅ Перезапускает systemd сервис
- ✅ Проверяет статус сервисов
- ✅ Создает лог файл в `logs/deploy_YYYYMMDD_HHMMSS.log`

### Ручное обновление

Если нужно обновить вручную:

```bash
cd /opt/Code-Assistent-prompt-generator

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

## Диагностика проблем

### Автоматическая диагностика

Для полной диагностики проблем с доступностью используйте скрипт:

```bash
cd /opt/Code-Assistent-prompt-generator
./diagnose_server.sh
```

Скрипт проверит:
- ✅ Статус systemd сервиса
- ✅ Слушается ли порт 8000
- ✅ Настройки файрвола
- ✅ Логи сервиса
- ✅ Локальное подключение
- ✅ Переменные окружения
- ✅ Статические файлы
- ✅ Конфигурацию systemd

### Быстрая проверка

Для быстрой проверки состояния сервера:

```bash
cd /opt/Code-Assistent-prompt-generator
python3 check_server.py
```

Проверка health endpoint:

```bash
curl http://localhost:8000/api/health
```

### Проверка доступности извне

Если сайт не доступен по внешнему IP (например, http://185.28.85.26:8000/), проверьте:

1. **Файрвол** - порт 8000 должен быть открыт:
   ```bash
   sudo ufw allow 8000/tcp
   sudo ufw status
   ```

2. **Сервис слушает на 0.0.0.0** (не только localhost):
   ```bash
   # Проверьте конфигурацию systemd
   sudo cat /etc/systemd/system/deepseek-web-client.service | grep ExecStart
   # Должно быть: --host 0.0.0.0 --port 8000
   ```

3. **Сервис запущен**:
   ```bash
   sudo systemctl status deepseek-web-client
   ```

4. **Порт слушается**:
   ```bash
   sudo netstat -tulpn | grep 8000
   # или
   sudo ss -tulpn | grep 8000
   ```

## Устранение неполадок

### Ошибка 500 от Nginx

Если вы видите ошибку "500 Internal Server Error" от nginx, это означает, что Nginx все еще проксирует запросы, но FastAPI не отвечает или не запущен.

**Решение:**
1. Отключите Nginx (см. Шаг 7 выше)
2. Убедитесь, что FastAPI сервис запущен:
   ```bash
   sudo systemctl status deepseek-web-client
   ```
3. Проверьте, что сервис слушает на порту 8000:
   ```bash
   sudo netstat -tulpn | grep 8000
   ```
4. Обращайтесь напрямую к FastAPI на порту 8000: `http://ваш-ip:8000`

### Сервис не запускается

#### Ошибка 203/EXEC (Main process exited, code=exited, status=203/EXEC)

Эта ошибка означает, что systemd не может выполнить команду из ExecStart. Обычно это происходит из-за:
- Неправильного пути к uvicorn
- Отсутствия виртуального окружения
- Неустановленных зависимостей

**Быстрое исправление (рекомендуется):**
```bash
cd /opt/Code-Assistent-prompt-generator
./quick_fix_uvicorn.sh
```

Этот скрипт быстро исправит проблему с отсутствующим uvicorn:
- Создаст виртуальное окружение (если отсутствует)
- Установит все зависимости включая uvicorn
- Обновит конфигурацию systemd
- Перезапустит сервис

**Полное исправление (если нужно проверить все настройки):**
```bash
cd /opt/Code-Assistent-prompt-generator
./fix_service.sh
```

Скрипт автоматически:
- Проверит и создаст виртуальное окружение
- Установит зависимости
- Обновит конфигурацию systemd с правильными путями
- Проверит права доступа
- Запустит сервис

**Ручное исправление:**
```bash
# 1. Проверьте логи
sudo journalctl -u deepseek-web-client -n 50

# 2. Проверьте, существует ли uvicorn
ls -la /opt/Code-Assistent-prompt-generator/venv/bin/uvicorn

# 3. Если нет, создайте venv и установите зависимости
cd /opt/Code-Assistent-prompt-generator
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

# 4. Проверьте конфигурацию systemd
sudo cat /etc/systemd/system/deepseek-web-client.service | grep ExecStart
# Должно быть: ExecStart=/opt/Code-Assistent-prompt-generator/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000

# 5. Если пути неправильные, обновите файл
sudo nano /etc/systemd/system/deepseek-web-client.service
# Исправьте пути на правильные

# 6. Перезагрузите systemd и запустите сервис
sudo systemctl daemon-reload
sudo systemctl restart deepseek-web-client
sudo systemctl status deepseek-web-client
```

#### Другие проблемы

```bash
# Проверьте логи
sudo journalctl -u deepseek-web-client -n 50

# Проверьте, что порт 8000 свободен
sudo netstat -tulpn | grep 8000

# Проверьте права доступа к файлам
ls -la /opt/Code-Assistent-prompt-generator
```

### Статические файлы не загружаются

- Убедитесь, что папка `static/` существует и содержит файлы
- Проверьте права доступа: `sudo chown -R www-data:www-data /opt/Code-Assistent-prompt-generator/static`

### API запросы не работают

- Проверьте, что переменная окружения `DEEPSEEK_API_KEY` установлена
- Проверьте логи FastAPI: `sudo journalctl -u deepseek-web-client -f`
- Убедитесь, что сервис слушает на правильном порту (8000)

### Сайт не доступен по внешнему IP

Если сайт не доступен по внешнему IP адресу (например, http://185.28.85.26:8000/):

1. **Проверьте файрвол**:
   ```bash
   # Откройте порт 8000
   sudo ufw allow 8000/tcp
   sudo ufw reload
   sudo ufw status
   ```

2. **Проверьте, что сервис слушает на 0.0.0.0** (не только 127.0.0.1):
   ```bash
   # Проверьте конфигурацию
   sudo cat /etc/systemd/system/deepseek-web-client.service | grep ExecStart
   # Должно содержать: --host 0.0.0.0
   
   # Если нет, отредактируйте файл:
   sudo nano /etc/systemd/system/deepseek-web-client.service
   # Измените на: --host 0.0.0.0 --port 8000
   sudo systemctl daemon-reload
   sudo systemctl restart deepseek-web-client
   ```

3. **Проверьте статус сервиса**:
   ```bash
   sudo systemctl status deepseek-web-client
   ```

4. **Проверьте логи на ошибки**:
   ```bash
   sudo journalctl -u deepseek-web-client -n 50 --no-pager
   ```

5. **Проверьте, что порт слушается на всех интерфейсах**:
   ```bash
   sudo netstat -tulpn | grep 8000
   # Должно показать: 0.0.0.0:8000 или :::8000
   ```

6. **Проверьте облачный файрвол** (если используете VPS):
   - AWS: Security Groups
   - DigitalOcean: Firewalls
   - Google Cloud: Firewall Rules
   - Azure: Network Security Groups
   
   Убедитесь, что порт 8000 открыт для входящих соединений.

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
   ExecStart=/opt/Code-Assistent-prompt-generator/venv/bin/gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
   ```

2. Использовать CDN для статических файлов
3. Настроить мониторинг (например, с помощью Prometheus + Grafana)


