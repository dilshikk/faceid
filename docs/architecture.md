# Архитектура

Общая схема компонентов Bot Control Center и как они взаимодействуют
друг с другом и с существующими сервисами на VPS.

## Компоненты

- **Веб-панель** (`frontend/`) — React + TypeScript + Vite + Tailwind
  CSS. Статически собирается (`npm run build`) и раздаётся Nginx'ом,
  обращается к API по `/api/*`.
- **BCC API** (`backend/app/main.py`, юнит `bcc-api.service`) — FastAPI
  приложение. Отдаёт REST-эндпоинты для дэшборда, сервисов, инцидентов,
  уведомлений и аутентификации. Слушает только на `127.0.0.1:8081`,
  наружу доступен через Nginx reverse proxy.
- **Воркер мониторинга** (`backend/app/workers/monitor_worker.py`, юнит
  `bcc-worker.service`) — отдельный процесс, который с заданным
  интервалом опрашивает `systemctl show` для каждого сервиса из
  allowlist (`monitored_services`), сохраняет статус в
  `service_status_history`, создаёт/обновляет инциденты через
  `incident_manager`, собирает серверные метрики
  (`metrics_collector`), раз в сутки запускает очистку старых данных
  (`retention`).
- **Telegram Admin Bot** (`backend/app/telegram_admin/`, юнит
  `bcc-adminbot.service`) — отдельный процесс на aiogram с long
  polling. Доступен только пользователям из allowlist
  `TELEGRAM_ADMIN_IDS`. Позволяет смотреть статусы, логи, подтверждать
  инциденты, регистрировать новые сервисы (`/addservice`) и ставить
  уведомления на пауза (`/silence`).
- **PostgreSQL** — отдельная база `bot_control_center` со своей ролью
  `bcc_user`. BCC никогда не подключается к базам самих ботов
  (mado-bot, invitebot, bkbot, tgbot).
- **systemd/journald** — источник правды о состоянии сервисов и их
  логах. BCC только читает (`systemctl show`, `journalctl`), не
  перезапускает и не останавливает сторонние юниты.

## Поток данных

```
                        ┌────────────────────┐
                        │   Веб-панель (SPA)  │
                        └──────────┬──────────┘
                                   │ HTTPS /api/*
                                   ▼
┌───────────────┐        ┌──────────────────┐        ┌─────────────────────┐
│ Telegram Admin │◄──────►│     BCC API       │◄──────►│     PostgreSQL       │
│      Bot        │ reads  │ (FastAPI, :8081) │  reads  │ bot_control_center   │
└───────────────┘  same   └──────────┬────────┘  /writes└─────────────────────┘
                     DB              │                              ▲
                                     │ reads                        │ writes
                                     ▼                              │
                        ┌─────────────────────┐                    │
                        │ Воркер мониторинга    │────────────────────┘
                        │ (polling loop)        │
                        └──────────┬────────────┘
                                   │ read-only
                                   ▼
                   ┌───────────────────────────────┐
                   │   systemd / journald на VPS     │
                   │ mado-bot, invitebot, bkbot, tgbot │
                   └───────────────────────────────┘
```

## Безопасность на границах

- API и воркер работают от отдельного системного пользователя `bcc`,
  без root и без `NoNewPrivileges`/`ProtectSystem=strict` в systemd
  (см. `deploy/systemd/*.service`).
- Чтение статусов и логов ограничено allowlist unit-имён
  (`is_valid_unit_name`, таблица `monitored_services`).
- Секреты (токены, пароли) маскируются в логах и API-ответах
  (`app.core.security.mask_secret`).
- Подробности — в [`security.md`](security.md).
