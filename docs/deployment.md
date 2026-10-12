# Развёртывание

Пошаговая инструкция для разворачивания Bot Control Center на
существующем VPS. Выполняется вручную; скрипты в `deploy/scripts/`
автоматизируют отдельные шаги, но ни один из них не был запущен и
протестирован авторами кода на реальном сервере — проверяйте каждую
команду перед выполнением.

Все команды ниже, где указаны пути вида `deploy/...` или `backend`, выполняются
из **корня клона репозитория**, пока не сказано иначе (в `/opt/bot-control-center`
копируется только `backend` и собранный фронтенд).

## Требования к серверу

- **Python 3.11 или новее.** На Ubuntu 22.04 по умолчанию Python 3.10 — `pip install .`
  завершится ошибкой. Установите `python3.11` и `python3.11-venv` и создавайте
  окружение через `python3.11 -m venv`.
- Пакет `python3-venv` (Debian/Ubuntu), PostgreSQL, Nginx, Node.js 18+ (только для
  сборки фронтенда), certbot.

## Шаг 0. Аудит (не изменяет систему)

```bash
bash deploy/scripts/audit_server.sh
```

Проверяет существующие systemd-юниты, PM2-процессы, Nginx-сайты,
PostgreSQL-базы и свободное место на диске. Ничего не меняет.

## Шаг 1. Пользователь и база данных

```bash
sudo bash deploy/scripts/create_user_and_db.sh
```

Создаёт системного пользователя `bcc` (без домашней директории, без
его shell, в группе `systemd-journal`) и базу `bot_control_center` с отдельной
ролью PostgreSQL `bcc_user`. Пароль роли генерируется случайно (или берётся
из `BCC_DB_PASSWORD`) и **печатается один раз в конце** — сохраните его для
`DATABASE_URL`. Если роль уже существовала, пароль не меняется.

## Шаг 2. Переменные окружения

```bash
sudo mkdir -p /etc/bot-control-center
sudo cp .env.example /etc/bot-control-center/bcc.env
sudo chown bcc:bcc /etc/bot-control-center/bcc.env
sudo chmod 600 /etc/bot-control-center/bcc.env
sudo nano /etc/bot-control-center/bcc.env   # заполните реальными значениями
```

Обязательно задайте: `DATABASE_URL` (с паролем из шага 1), `SECRET_KEY`
(длинная случайная строка, например `openssl rand -hex 32`), `CORS_ORIGINS`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_IDS`.

## Шаг 3. Backend

```bash
sudo mkdir -p /opt/bot-control-center
sudo cp -r backend /opt/bot-control-center/backend
cd /opt/bot-control-center/backend
sudo python3.11 -m venv .venv      # или python3, если он уже >= 3.11
sudo .venv/bin/pip install .
```

Миграции читают настройки из переменных окружения. systemd подгружает файл
`bcc.env` только для своих юнитов, поэтому для ручных команд его нужно
загружать самому:

```bash
sudo bash -c 'set -a; . /etc/bot-control-center/bcc.env; set +a; .venv/bin/alembic upgrade head'
```

Зависимости и версия пакета описаны в `backend/pyproject.toml` —
отдельного файла `requirements.txt` нет.

## Шаг 4. Создать первого администратора

Веб-регистрации намеренно нет. В той же папке `/opt/bot-control-center/backend`:

```bash
sudo bash -c 'set -a; . /etc/bot-control-center/bcc.env; set +a; .venv/bin/python -m app.cli.create_user ИМЯ --role owner'
```

Пароль (не короче 12 символов) запрашивается интерактивно и не остаётся
в истории команд.

## Шаг 5. Systemd-юниты

Из корня клона репозитория (в `/opt/bot-control-center` папки `deploy` нет):

```bash
sudo bash deploy/scripts/install_units.sh
sudo systemctl start bcc-worker
# проверьте, что воркер пишет статусы в service_status_history, ДО запуска API/UI
sudo systemctl start bcc-api bcc-adminbot
sudo journalctl -u bcc-worker -u bcc-api -u bcc-adminbot -n 50 --no-pager   # проверка ошибок запуска
```

## Шаг 6. Frontend и Nginx

```bash
(cd frontend && npm install && npm run build)
sudo mkdir -p /opt/bot-control-center/frontend
sudo cp -r frontend/dist /opt/bot-control-center/frontend/dist
```

В `deploy/nginx/bcc.conf` замените `bots.example.com` на ваш домен (в трёх местах).

**Сначала выпустите TLS-сертификат**, потом включайте конфиг: он ссылается
на файлы сертификата, и без них `nginx -t` падает. Например
`sudo certbot certonly --nginx -d ДОМЕН` (если для домена ещё нет сайта в nginx, создайте
временный блок `server` на порту 80 с этим `server_name`).

```bash
sudo cp deploy/nginx/bcc.conf /etc/nginx/sites-available/bcc.conf
sudo ln -s /etc/nginx/sites-available/bcc.conf /etc/nginx/sites-enabled/bcc.conf
sudo nginx -t && sudo systemctl reload nginx
```

Вход в панель работает только по HTTPS: cookie сессии выдаётся с признаком `Secure`.
Для локальной разработки (`npm run dev`) запросы `/api` проксируются на
`127.0.0.1:8081`, а браузер принимает `Secure`-cookie на `http://localhost`.

## Шаг 7. Добавить сервисы в реестр

В веб-панели (`/services`) и в Telegram-боте (команда `/addservice`) есть форма
регистрации сервиса — отдельный SQL не нужен. Зарегистрируйте
`mado-bot.service`, `invitebot.service`, `bkbot.service`, `tgbot.service` через любой из этих
интерфейсов.

## Шаг 8. Проверка

- Остановите тестовый сервис, подтвердите, что инцидент появляется и
  приходит уведомление в Telegram.
- Запустите сервис обратно, подтвердите уведомление о восстановлении.
- Перезагрузите VPS, подтвердите автозапуск всех трёх юнитов BCC.
- Подтвердите, что `mado-bot`, `invitebot`, `bkbot`, `tgbot` не были остановлены
  или изменены в процессе.
