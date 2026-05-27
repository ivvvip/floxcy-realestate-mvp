"""OpenRouter chat completions client.

- httpx async, 30s timeout, 3 retries with exponential backoff
- Tries default → fallback model chain on hard failures (5xx, timeout)
- Returns structured ChatResult: content + usage + cost + latency + model
- Never logs the API key or full request body
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

from app.config import settings


logger = logging.getLogger("floxcy.openrouter")


OPENROUTER_BASE = "https://openrouter.ai/api/v1"


@dataclass
class ChatResult:
    ok: bool
    content: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    fallback_used: bool = False
    error: Optional[str] = None
    raw: dict = field(default_factory=dict)


def _headers() -> dict[str, str]:
    if not settings.OPENROUTER_API_KEY:
        return {}
    return {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.OPENROUTER_APP_URL,
        "X-Title": settings.OPENROUTER_APP_NAME,
    }


def _extract_usage(payload: dict) -> tuple[int, int, int, float]:
    usage = payload.get("usage", {}) or {}
    prompt = int(usage.get("prompt_tokens", 0) or 0)
    comp = int(usage.get("completion_tokens", 0) or 0)
    total = int(usage.get("total_tokens", prompt + comp) or 0)
    # OpenRouter sometimes returns cost in usage; otherwise 0.
    cost = float(usage.get("cost", 0.0) or 0.0)
    return prompt, comp, total, cost


async def _post_chat(
    client: httpx.AsyncClient,
    model: str,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
) -> dict:
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "usage": {"include": True},  # request usage details if supported
    }
    resp = await client.post(
        f"{OPENROUTER_BASE}/chat/completions",
        headers=_headers(),
        json=body,
    )
    resp.raise_for_status()
    return resp.json()


async def chat(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    fallback_model: Optional[str] = None,
    max_tokens: Optional[int] = None,
    temperature: float = 0.3,
    max_attempts: int = 3,
) -> ChatResult:
    """Call OpenRouter chat completions with retries and a fallback model chain."""
    if not settings.OPENROUTER_API_KEY:
        return ChatResult(
            ok=False,
            content="",
            model=model or settings.OPENROUTER_DEFAULT_MODEL,
            error="OPENROUTER_API_KEY not configured",
        )

    primary = model or settings.OPENROUTER_DEFAULT_MODEL
    secondary = fallback_model or settings.OPENROUTER_FALLBACK_MODEL
    mt = max_tokens or settings.OPENROUTER_MAX_TOKENS
    start = time.perf_counter()

    async with httpx.AsyncClient(timeout=settings.OPENROUTER_TIMEOUT_S) as client:
        for chain_idx, current_model in enumerate([primary, secondary]):
            for attempt in range(max_attempts):
                try:
                    payload = await _post_chat(
                        client, current_model, system, user, mt, temperature
                    )
                    choices = payload.get("choices") or []
                    if not choices:
                        raise RuntimeError("no choices in response")
                    content = (choices[0].get("message") or {}).get("content") or ""
                    if not content.strip():
                        raise RuntimeError("empty content")
                    p, c, t, cost = _extract_usage(payload)
                    latency = int((time.perf_counter() - start) * 1000)
                    return ChatResult(
                        ok=True,
                        content=content,
                        model=payload.get("model", current_model),
                        prompt_tokens=p,
                        completion_tokens=c,
                        total_tokens=t,
                        cost_usd=cost,
                        latency_ms=latency,
                        fallback_used=chain_idx > 0,
                        raw={"id": payload.get("id"), "provider": payload.get("provider")},
                    )
                except httpx.HTTPStatusError as e:
                    status = e.response.status_code
                    body_text = (e.response.text or "")[:200]
                    logger.warning(
                        "openrouter http %d (attempt %d/%d, model=%s): %s",
                        status, attempt + 1, max_attempts, current_model, body_text,
                    )
                    # 4xx (except 429) is a permanent error — break to next model
                    if 400 <= status < 500 and status != 429:
                        break
                except (httpx.HTTPError, RuntimeError, ValueError, KeyError) as e:
                    logger.warning(
                        "openrouter call failed (attempt %d/%d, model=%s): %s",
                        attempt + 1, max_attempts, current_model, e,
                    )
                # Exponential backoff: 0.25s, 1s, 4s
                await asyncio.sleep(0.25 * (4 ** attempt))

    return ChatResult(
        ok=False,
        content="",
        model=primary,
        error="all retries and fallback exhausted",
        latency_ms=int((time.perf_counter() - start) * 1000),
        fallback_used=True,
    )
