"""Tests for password hashing, JWT, and API key generation."""
import pytest

from app.core.security import (
    create_session_token,
    decode_session_token,
    extract_prefix,
    generate_api_key,
    hash_password,
    verify_api_key,
    verify_password,
)
from uuid import uuid4


def test_password_roundtrip():
    h = hash_password("hunter2!")
    assert h != "hunter2!"
    assert verify_password("hunter2!", h)
    assert not verify_password("wrong", h)


def test_password_handles_invalid_hash():
    assert not verify_password("anything", "not-a-real-hash")


def test_session_token_roundtrip():
    uid = uuid4()
    token = create_session_token(uid, "admin", "khaled")
    payload = decode_session_token(token)
    assert payload is not None
    assert payload["sub"] == str(uid)
    assert payload["role"] == "admin"
    assert payload["username"] == "khaled"


def test_session_token_invalid_signature():
    token = create_session_token(uuid4(), "admin", "x")
    # Tamper with payload
    bad = token[:-3] + "AAA"
    assert decode_session_token(bad) is None


def test_api_key_format():
    full, prefix = generate_api_key("live")
    assert full.startswith("fxc_live_")
    assert prefix.startswith("fxc_live_")
    assert len(prefix) == len("fxc_live_") + 8
    assert extract_prefix(full) == prefix


def test_api_key_verify():
    from app.core.security import hash_api_key
    full, _ = generate_api_key("test")
    h = hash_api_key(full)
    assert verify_api_key(full, h)
    assert not verify_api_key("fxc_test_other", h)


def test_extract_prefix_rejects_garbage():
    assert extract_prefix("nope") is None
    assert extract_prefix("fxc_x") is None
