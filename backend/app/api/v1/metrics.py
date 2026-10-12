"""Server metrics endpoint (TZ 4.1, 7)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db import get_db
from app.models.models import User
from app.repositories.repositories import latest_server_metric
from app.schemas.schemas import ServerMetricOut

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/server", response_model=ServerMetricOut)
def server_metrics(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    metric = latest_server_metric(db)
    if metric is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No metrics collected yet")
    return ServerMetricOut(
        cpu_percent=metric.cpu_percent,
        ram_percent=metric.ram_percent,
        disk_percent=metric.disk_percent,
        uptime_seconds=metric.uptime_seconds,
        observed_at=metric.observed_at,
    )
