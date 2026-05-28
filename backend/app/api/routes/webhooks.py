"""n8n webhook placeholders.

Inbound endpoints that n8n (or any external automation) can call when a
supply-layer event happens. For now they accept any JSON, optionally
verify an HMAC-SHA256 signature against ``settings.N8N_WEBHOOK_SECRET``
when set, log the payload, and return 200.

Real automation (WhatsApp / email / CRM sync) plugs in later — these
stubs exist so n8n flows can be authored and pointed at stable URLs.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.config import settings


router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])
logger = logging.getLogger("floxcy.webhooks")


def _verify_signature(raw_body: bytes, signature: Optional[str]) -> None:
    """If ``N8N_WEBHOOK_SECRET`` is configured, require a matching signature.

    When the secret is empty (default), the endpoints accept unsigned
    requests so local development and early n8n trials are not blocked.
    """
    secret = getattr(settings, "N8N_WEBHOOK_SECRET", None) or ""
    if not secret:
        return
    if not signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Webhook-Signature header",
        )
    expected = hmac.new(
        secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    # Accept either bare hex or sha256=<hex> per common conventions.
    candidate = signature.removeprefix("sha256=").strip()
    if not hmac.compare_digest(expected, candidate):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature",
        )


async def _ack(
    request: Request,
    signature: Optional[str],
    event: str,
) -> dict[str, Any]:
    raw = await request.body()
    _verify_signature(raw, signature)
    try:
        payload = await request.json()
    except Exception:
        payload = None
    logger.info(
        "n8n webhook received event=%s bytes=%d keys=%s",
        event,
        len(raw),
        sorted(payload.keys()) if isinstance(payload, dict) else "non-object",
    )
    return {"status": "ok", "event": event, "received": True}


@router.post("/new-lead")
async def webhook_new_lead(
    request: Request,
    x_webhook_signature: Optional[str] = Header(default=None),
):
    return await _ack(request, x_webhook_signature, "new-lead")


@router.post("/broker-approved")
async def webhook_broker_approved(
    request: Request,
    x_webhook_signature: Optional[str] = Header(default=None),
):
    return await _ack(request, x_webhook_signature, "broker-approved")


@router.post("/opportunity-approved")
async def webhook_opportunity_approved(
    request: Request,
    x_webhook_signature: Optional[str] = Header(default=None),
):
    return await _ack(request, x_webhook_signature, "opportunity-approved")
