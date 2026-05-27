"""HTTP middleware: security headers + structured request logging."""
from __future__ import annotations

import logging
import time
from typing import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


logger = logging.getLogger("floxcy.http")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add OWASP-recommended HTTP security headers to every response."""

    def __init__(self, app, enable_hsts: bool = True):
        super().__init__(app)
        self.enable_hsts = enable_hsts

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)
        # API is JSON — keep CSP locked down. Docs UI loads from CDN; allow when /docs path.
        if request.url.path.startswith("/docs") or request.url.path.startswith("/redoc"):
            csp = (
                "default-src 'self'; "
                "img-src 'self' data: https://fastapi.tiangolo.com; "
                "script-src 'self' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "font-src 'self' data:; "
                "connect-src 'self';"
            )
        else:
            csp = (
                "default-src 'none'; "
                "frame-ancestors 'none'; "
                "base-uri 'self';"
            )
        response.headers["Content-Security-Policy"] = csp
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=()"
        )
        if self.enable_hsts:
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
        return response


class RequestLogMiddleware(BaseHTTPMiddleware):
    """Log every request as structured json-ish line. Strips secrets."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        start = time.perf_counter()
        method = request.method
        path = request.url.path
        try:
            response = await call_next(request)
            duration_ms = (time.perf_counter() - start) * 1000
            logger.info(
                "request method=%s path=%s status=%d duration_ms=%.1f",
                method,
                path,
                response.status_code,
                duration_ms,
            )
            return response
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.exception(
                "request method=%s path=%s status=500 duration_ms=%.1f",
                method,
                path,
                duration_ms,
            )
            return JSONResponse(
                status_code=500,
                content={"error": "internal_error", "message": "An unexpected error occurred."},
            )
