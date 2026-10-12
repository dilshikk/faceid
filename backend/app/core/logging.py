"""Logging setup. Every formatter masks secrets before writing output."""
import logging
import sys

from app.core.security import mask_secret


class MaskingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        original = super().format(record)
        return mask_secret(original)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        MaskingFormatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    )
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers = [handler]
