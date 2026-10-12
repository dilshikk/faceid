"""FastAPI application entrypoint. Runs on 127.0.0.1 only; Nginx terminates
TLS and proxies to this process (TZ 3, 8).
"""
import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import auth, dashboard, health, incidents, metrics, notifications, services
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.repositories.repositories import InvalidCursorError

configure_logging()
settings = get_settings()
logger = logging.getLogger("bcc.api")

app = FastAPI(title="Bot Control Center API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(services.router, prefix="/api/v1")
app.include_router(incidents.router, prefix="/api/v1")
app.include_router(metrics.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")


@app.exception_handler(InvalidCursorError)
async def invalid_cursor_handler(request: Request, exc: InvalidCursorError):
    return JSONResponse(status_code=400, content={"detail": "Invalid cursor"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = str(uuid.uuid4())
    # Log the details server-side (secrets are masked by the log formatter);
    # without this a 500 leaves no trace anywhere. The client only gets the id.
    logger.error("unhandled error request_id=%s path=%s", request_id, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"request_id": request_id, "message": "Internal server error"},
    )


@app.get("/healthz")
def healthz():
    # Kept for backwards compatibility with deploy/nginx/bcc.conf.
    # Prefer /api/v1/health/live and /api/v1/health/ready for new integrations.
    return {"status": "ok"}
