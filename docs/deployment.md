# Развёртывание

Пошаговая инструкция для разворачивания Bot Control Center на
существующем VPS. Выполняется вручную; скрипты в `deploy/scripts/`
автоматизируют отдельные шаги, но ни один из них не был запущен и
протестирован авторами кода на реальном сервере — проверяйте каждую
команду перед выполнением.

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
shell) и базу `bot_control_center` с отдельной ролью PostgreSQL
`bcc_user`. Смените пароль роли сразу после выполнения.

## Шаг 2. Переменные окружения

```bash
sudo mkdir -p /etc/bot-control-center
sudo cp .env.example /etc/bot-control-center/bcc.env
sudo chown bcc:bcc /etc/bot-control-center/bcc.env
sudo chmod 600 /etc/bot-control-center/bcc.env
sudo nano /etc/bot-control-center/bcc.env   # заполните реальными значениями
```

Обязательно задайте: `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_IDS`.

## Шаг 3. Backend

```bash
sudo mkdir -p /opt/bot-control-center
sudo cp -r backend /opt/bot-control-center/backend
cd /opt/bot-control-center/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head
```

## Шаг 4. Создать первого администратора

Выполните разово (например, через `python -i` с активным venv и
`DATABASE_URL`), используя `app.core.security.hash_password` и вставив
строку в таблицу `users` с ролью `owner`. Веб-регистрации нет намеренно —
только явное создание первого аккаунта.

## Шаг 5. Systemd-юниты

```bash
cd /opt/bot-control-center
sudo bash deploy/scripts/install_units.sh
sudo systemctl start bcc-worker
# проверьте, что воркер пишет статусы в service_status_history, ДО запуска API/UI
sudo systemctl start bcc-api bcc-adminbot
```

## Шаг 6. Frontend и Nginx

```bash
cd frontend
npm install
npm run build
sudo cp -r dist /opt/bot-control-center/frontend/dist
sudo cp deploy/nginx/bcc.conf /etc/nginx/sites-available/bcc.conf
sudo ln -s /etc/nginx/sites-available/bcc.conf /etc/nginx/sites-enabled/bcc.conf
sudo nginx -t && sudo systemctl reload nginx
```

Выпустите TLS-сертификат (например, через certbot) для домена,
указанного в `bcc.conf`.

## Шаг 7. Добавить сервисы в реестр

Вставьте строки в `monitored_services` для `mado-bot.service`,
`invitebot.service`, `bkbot.service`, `tgbot.service` (или через будущий
UI-экран управления сервисами, который не входит в MVP — используйте SQL
напрямую на этом этапе).

## Шаг 8. Проверка

- Остановите тестовый сервис, подтвердите, что инцидент появляется и
  приходит уведомление в Telegram.
- Запустите сервис обратно, подтвердите уведомление о восстановлении.
- Перезагрузите VPS, подтвердите автозапуск всех трёх юнитов BCC.
- Подтвердите, что `mado-bot`, `invitebot`, `bkbot`, `tgbot` не были
  остановлены или изменены в процессе.
