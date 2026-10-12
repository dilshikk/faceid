# Bot Control Center

Единая система мониторинга фоновых сервисов на VPS: веб-панель и Telegram
Admin Bot для статусов, логов, инцидентов и уведомлений. Реализовано по ТЗ
версии 1.0 (12 октября 2026 г.).

Полный текст технического задания сохранён в [`docs/tz.md`](docs/tz.md).

## Статус реализации

Весь код из этого ТЗ написан и находится в репозитории. Он **не был
развёрнут, не запускался и не тестировался на реальном сервере** —
разработка велась без доступа к целевому VPS, systemd, PostgreSQL или
Telegram API. Перед первым запуском пройдите аудит (этап 1, см. ниже) и
проверьте код на тестовом стенде.

## Структура репозитория

```
backend/            FastAPI API, worker мониторинга, Telegram Admin Bot
  app/
    main.py          Точка входа API (bcc-api.service)
    workers/         Воркер опроса systemd/journald (bcc-worker.service)
    telegram_admin/  Telegram-бот на aiogram (bcc-adminbot.service)
    api/v1/          REST-роуты (auth, dashboard, services, incidents, metrics, notifications)
    core/            Конфигурация, безопасность, логирование
    models/          SQLAlchemy-модели (таблицы bot_control_center)
    services/        systemd_monitor, journal_reader, metrics_collector,
                      incident_manager, notification_service
  migrations/        Alembic-миграции
  tests/             Юнит-тесты (pytest)
frontend/            React/TS/Vite/Tailwind веб-панель (см. src/)
deploy/
  systemd/           Юниты bcc-api, bcc-worker, bcc-adminbot
  nginx/             Конфиг reverse proxy
  scripts/           audit_server.sh, create_user_and_db.sh, install_units.sh
docs/                tz.md, deployment.md, security.md
.env.example         Шаблон переменных окружения (без секретов)
```

## Быстрый старт (на целевом VPS)

1. Прочитайте [`docs/deployment.md`](docs/deployment.md) полностью перед началом.
2. Запустите `deploy/scripts/audit_server.sh` — он только читает состояние сервера, ничего не меняет.
3. Создайте пользователя и базу: `deploy/scripts/create_user_and_db.sh`.
4. Установите зависимости backend (`pip install -r backend/requirements.txt`), заполните `/etc/bot-control-center/bcc.env` на основе `.env.example`.
5. Выполните миграции: `alembic upgrade head` (из `backend/`).
6. Установите systemd-юниты: `deploy/scripts/install_units.sh`, затем запустите `bcc-worker` и проверьте сбор статусов **до** подключения UI.
7. Соберите фронтенд (`npm run build` в `frontend/`), настройте Nginx по `deploy/nginx/bcc.conf`, выпустите HTTPS-сертификат.
8. Запустите `bcc-api` и `bcc-adminbot`, добавьте нужные сервисы в `monitored_services`.

Критическое ограничение: установка и перезапуск BCC не должны требовать
остановки существующих `mado-bot.service`, `invitebot.service`,
`bkbot.service`, `tgbot.service`. Их unit-файлы, окружение, порты и базы
данных не изменяются этим проектом.

## Безопасность

См. [`docs/security.md`](docs/security.md): отдельный Linux-пользователь без
root, allowlist systemd-юнитов, Argon2id для паролей, allowlist Telegram ID,
маскирование секретов в логах и API-ответах.
