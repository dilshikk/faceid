"""Simple in-memory sliding-window rate limiter (TZ section 7).

BCC runs as a single process behind Nginx (TZ section 3), so an in-memory
limiter is sufficient here; it deliberately avoids pulling in Redis or a
third-party limiter for a project of this size. State resets on restart,
which is an acceptable trade-off for this app's scale.
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def __call__(self, request: Request) -> None:
        client_host = request.client.host if request.client else "unknown"
        key = f"{client_host}:{request.url.path}"
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        if len(hits) >= self.max_requests:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests, try again later"
            )
        hits.append(now)


# Stricter limit on login to slow down credential guessing.
login_rate_limiter = RateLimiter(max_requests=10, window_seconds=60)

# Looser limit on authenticated mutations, mostly to bound abuse/bugs.
mutation_rate_limiter = RateLimiter(max_requests=30, window_seconds=60)
