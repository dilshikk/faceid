"""Entrypoint for the standalone Telegram Admin Bot process
(bcc-adminbot.service). Uses long polling; no webhook/public port needed.
"""
import asyncio

from aiogram import Bot, Dispatcher

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.telegram_admin.handlers import router


async def main() -> None:
    configure_logging()
    settings = get_settings()
    if not settings.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")

    bot = Bot(token=settings.telegram_bot_token)
    dp = Dispatcher()
    dp.include_router(router)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
