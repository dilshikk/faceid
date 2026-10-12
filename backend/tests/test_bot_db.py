import datetime as dt
import decimal

import pytest

from app.services.bot_db import (
    MASKED_VALUE,
    MAX_CELL_LENGTH,
    BotDbError,
    escape_like,
    is_sensitive_column,
    serialize_cell,
    split_table_name,
)


def test_split_table_name():
    assert split_table_name("public.users") == ("public", "users")


@pytest.mark.parametrize("bad", ["users", ".users", "public."])
def test_split_table_name_rejects_bad_input(bad):
    with pytest.raises(BotDbError):
        split_table_name(bad)


def test_sensitive_columns_are_masked():
    assert is_sensitive_column("password_hash")
    assert is_sensitive_column("API_KEY")
    assert not is_sensitive_column("username")
    assert serialize_cell("secret-value", True) == MASKED_VALUE
    assert serialize_cell(None, True) is None


def test_serialize_cell_types():
    assert serialize_cell(123456789012, False) == 123456789012
    assert serialize_cell(True, False) is True
    assert serialize_cell(dt.datetime(2026, 1, 2, 3, 4, 5), False) == "2026-01-02T03:04:05"
    assert serialize_cell(decimal.Decimal("1.50"), False) == "1.50"
    assert serialize_cell(b"abc", False) == "<3 байт>"
    assert serialize_cell({"a": "б"}, False) == '{"a": "б"}'
    assert serialize_cell(float("nan"), False) == "nan"


def test_long_text_is_truncated():
    result = serialize_cell("x" * (MAX_CELL_LENGTH + 50), False)
    assert isinstance(result, str)
    assert len(result) == MAX_CELL_LENGTH + 1


def test_escape_like():
    assert escape_like("50%_a\\") == "50\\%\\_a\\\\"
