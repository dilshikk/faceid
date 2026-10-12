"""Test setup: app.db builds the SQLAlchemy engine at import time and
Settings requires these variables. create_engine does not connect, so dummy
values are enough for pure unit tests."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test")
os.environ.setdefault("SECRET_KEY", "test-secret")
