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
bot-control-center/
├── frontend/                  React/TS/Vite/Tailwind веб-панель
│   ├── src/
│   │   ├── app/               App.tsx — роутинг
│   │   ├── components/        Layout, StatusBadge и другие общие компоненты
│   │   ├── pages/              Dashboard, Services, ServiceDetails, Logs,
│   │   │                       Incidents, Settings, Login
│   │   ├── api/                HTTP-клиент
│   │   ├── hooks/              useApi.ts (запросы, пагинация, авторизация)
│   │   └── types/               Общие типы данных
│   ├── package.json
│   └── vite.config.ts
├── backend/                   FastAPI API, воркер мониторинга, Telegram Admin Bot
│   ├── app/
│   │   ├── main.py             Точка входа API (bcc-api.service)
│   │   ├── api/v1/              REST-роуты (auth, dashboard, services,
│   │   │                        incidents, metrics, notifications)
│   │   ├── core/                Конфигурация, безопасность, логирование,
│   │   │                        rate limiting
│   │   ├── models/              SQLAlchemy-модели (таблицы bot_control_center)
│   │   ├── schemas/              Pydantic-схемы запросов/ответов
│   │   ├── repositories/         Доступ к данным (пагинация, CRUD)
│   │   ├── services/             systemd_monitor, journal_reader,
│   │   │                         metrics_collector, incident_manager,
│   │   │                         notification_service, retention
│   │   ├── workers/               Воркер опроса systemd/journald (bcc-worker.service)
│   │   └── telegram_admin/        Telegram-бот на aiogram (bcc-adminbot.service)
│   ├── migrations/                Alembic-миграции
│   ├── tests/                     Юнит-тесты (pytest)
│   └── pyproject.toml             Зависимости и метаданные пакета
├── deploy/
│   ├── systemd/                   Юниты bcc-api, bcc-worker, bcc-adminbot
│   ├── nginx/                     Конфиг reverse proxy
│   └── scripts/                   audit_server.sh, create_user_and_db.sh,
│                                   install_units.sh
├── docs/                           architecture.md, api.md, security.md,
│                                    deployment.md, tz.md
├── .env.example                    Шаблон переменных окружения (без секретов)
└── .gitignore
```

## Быстрый старт (на целевом VPS)

1. Прочитайте [`docs/deployment.md`](docs/deployment.md) полностью перед началом.
2. Запустите `deploy/scripts/audit_server.sh` — он только читает состояние сервера, ничего не меняет.
3. Создайте пользователя и базу: `deploy/scripts/create_user_and_db.sh`.
4. Установите зависимости backend (`pip install .` из каталога `backend/`), заполните `/etc/bot-control-center/bcc.env` на основе `.env.example`.
5. Выполните миграции: `alembic upgrade head` (из `backend/`).
6. Установите systemd-юниты: `deploy/scripts/install_units.sh`, затем запустите `bcc-worker` и проверьте сбор статусов **до** подключения UI.
7. Соберите фронтенд (`npm run build` в `frontend/`), настройте Nginx по `deploy/nginx/bcc.conf`, выпустите HTTPS-сертификат.
8. Запустите `bcc-api` и `bcc-adminbot`. Новые сервисы можно зарегистрировать прямо из веб-панели или командой `/addservice` в Telegram.

Критическое ограничение: установка и перезапуск BCC не должны требовать
остановки существующих `mado-bot.service`, `invitebot.service`,
`bkbot.service`, `tgbot.service`. Их unit-файлы, окружение, порты и базы
данных не изменяются этим проектом.

## Документация

- [`docs/architecture.md`](docs/architecture.md) — компоненты системы и поток данных
- [`docs/api.md`](docs/api.md) — справочник REST API
- [`docs/security.md`](docs/security.md) — модель безопасности
- [`docs/deployment.md`](docs/deployment.md) — пошаговое развёртывание
- [`docs/tz.md`](docs/tz.md) — исходное техническое задание

## Безопасность

См. [`docs/security.md`](docs/security.md): отдельный Linux-пользователь без
root, allowlist systemd-юнитов, Argon2id для паролей, allowlist Telegram ID,
маскирование секретов в логах и API-ответах.
