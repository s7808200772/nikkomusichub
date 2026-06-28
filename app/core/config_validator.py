"""Pydantic-style environment variable validation.

This module is imported at application startup so missing or invalid env vars
fail loudly before the first request is served.
"""
from __future__ import annotations

import os
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator


class NikkoSettings(BaseModel):
    env: str = Field(default="development", alias="NIKKO_ENV")
    secret_key: str = Field(default="", alias="NIKKO_SECRET_KEY")
    cookie_secure: bool = Field(default=False, alias="NIKKO_COOKIE_SECURE")
    mqtt_broker: str = Field(default="broker.hivemq.com", alias="NIKKO_MQTT_BROKER")
    mqtt_port: int = Field(default=8883, alias="NIKKO_MQTT_PORT")
    mqtt_username: str = Field(default="", alias="NIKKO_MQTT_USERNAME")
    mqtt_password: str = Field(default="", alias="NIKKO_MQTT_PASSWORD")
    mqtt_topic_prefix: str = Field(default="nikko", alias="NIKKO_MQTT_TOPIC_PREFIX")
    mqtt_command_secret: str = Field(default="", alias="NIKKO_MQTT_COMMAND_SECRET")
    mqtt_store_id: str = Field(default="", alias="NIKKO_MQTT_STORE_ID")
    mqtt_tls: bool = Field(default=True, alias="NIKKO_MQTT_TLS")
    mqtt_ca_path: str = Field(default="", alias="NIKKO_MQTT_CA_PATH")

    @field_validator("env")
    @classmethod
    def _lower_env(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("secret_key")
    @classmethod
    def _secret_key_required_in_production(cls, v: str, info) -> str:
        values = info.data
        if values.get("env") == "production" and len(v) < 32:
            raise ValueError("NIKKO_SECRET_KEY is required and must be >= 32 characters in production")
        return v

    @field_validator("mqtt_command_secret", "mqtt_topic_prefix")
    @classmethod
    def _mqtt_required_in_production(cls, v: str, info) -> str:
        values = info.data
        if values.get("env") == "production" and not v:
            raise ValueError(f"{info.field_name} is required in production")
        return v


def _load_from_env() -> dict[str, Any]:
    """Read env vars using the pydantic field aliases."""
    data: dict[str, Any] = {}
    for field_name, field in NikkoSettings.model_fields.items():
        alias = field.alias or field_name
        raw = os.environ.get(alias, field.default)
        if isinstance(field.default, bool):
            data[field_name] = str(raw).strip().lower() in ("1", "true", "yes")
        elif isinstance(field.default, int):
            try:
                data[field_name] = int(raw)
            except Exception as e:
                raise ValueError(f"{alias} must be an integer") from e
        else:
            data[field_name] = raw
    return data


def validate_settings() -> NikkoSettings:
    try:
        return NikkoSettings(**_load_from_env())
    except ValidationError as e:
        raise RuntimeError(f"Environment validation failed:\n{e}") from e


# Imported by app.main to fail fast on startup.
settings = validate_settings()
