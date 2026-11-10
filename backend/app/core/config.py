"""Application settings, loaded from environment variables / .env."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import EmailStr, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ------------------------------------------------------------------ app
    app_name: str = "SPUNI"
    environment: Literal["development", "test", "production"] = "development"
    debug: bool = False
    api_prefix: str = "/api/v1"

    # Public URLs (used in emails and CORS)
    storefront_url: str = "http://localhost:4200"
    admin_url: str = "http://localhost:4300"
    public_api_url: str = "http://localhost:8000"
    # NoDecode: accept comma-separated values in .env (split by _split_csv)
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:4200", "http://localhost:4300"]
    )
    trusted_hosts: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["*"])

    # ------------------------------------------------------------- database
    database_url: str = "postgresql+asyncpg://spuni:spuni@localhost:5432/spuni"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_echo: bool = False
    # Optional superuser URL, used only to create the app role/database on first run
    database_admin_url: SecretStr | None = None
    # On startup: create the database if missing, run migrations, seed an empty database
    auto_setup_db: bool = True

    # ------------------------------------------------------------- security
    secret_key: SecretStr = SecretStr("change-me-in-production-please-use-64-random-chars")
    otp_pepper: SecretStr = SecretStr("change-me-otp-pepper")
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    admin_refresh_token_ttl_days: int = 1
    cookie_secure: bool = False
    cookie_domain: str | None = None
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    otp_length: int = 6
    otp_ttl_minutes: int = 10
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 60
    otp_max_requests_per_hour: int = 6

    # ---------------------------------------------------------------- email
    email_backend: Literal["console", "smtp"] = "console"
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_use_tls: bool = False  # implicit TLS (port 465)
    smtp_start_tls: bool = True  # STARTTLS (port 587)
    email_from: str = "SPUNI <no-reply@spuni.in>"
    email_reply_to: str | None = "spunileathers@gmail.com"
    email_worker_interval_seconds: float = 3.0
    email_max_attempts: int = 5

    # ------------------------------------------------------------- payments
    payment_mode: Literal["mock", "razorpay"] = "mock"
    razorpay_key_id: str = ""
    razorpay_key_secret: SecretStr = SecretStr("")
    razorpay_webhook_secret: SecretStr = SecretStr("")
    pending_order_ttl_minutes: int = 30

    # ---------------------------------------------------------------- media
    media_root: Path = BASE_DIR / "media"
    media_url: str = "/media"
    max_upload_mb: int = 8
    max_customization_files: int = 5

    # ------------------------------------------------------------ bootstrap
    initial_admin_email: EmailStr | None = None
    initial_admin_name: str = "SPUNI Admin"

    @field_validator("cors_origins", "trusted_hosts", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            if value.strip().startswith("["):
                return json.loads(value)
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _production_guards(self) -> "Settings":
        if self.environment == "production":
            weak = ("change-me", "secret", "password")
            key = self.secret_key.get_secret_value()
            if len(key) < 48 or any(w in key for w in weak):
                raise ValueError("SECRET_KEY must be a strong random value (>=48 chars) in production")
            if "change-me" in self.otp_pepper.get_secret_value():
                raise ValueError("OTP_PEPPER must be set in production")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in production")
            if self.debug:
                raise ValueError("DEBUG must be false in production")
            if self.payment_mode == "razorpay" and not (
                self.razorpay_key_id and self.razorpay_key_secret.get_secret_value()
            ):
                raise ValueError("Razorpay keys are required when PAYMENT_MODE=razorpay")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
