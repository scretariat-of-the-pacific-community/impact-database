"""Email service for sending notifications.

Supports SMTP, SendGrid, and Console backends.
Configure via environment variables or core/config.py EmailSettings:
- EMAIL_BACKEND: 'smtp', 'sendgrid', or 'console' (default: 'console')
- SMTP_HOST: SMTP server host
- SMTP_PORT: SMTP server port (default: 587)
- SMTP_USER: SMTP username
- SMTP_PASSWORD: SMTP password
- SMTP_USE_TLS: Use TLS (default: true)
- SENDGRID_API_KEY: SendGrid API key (if using sendgrid backend)
- EMAIL_FROM_ADDRESS: Default sender email
- EMAIL_FROM_NAME: Default sender name
"""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class EmailBackend(Enum):
    SMTP = "smtp"
    SENDGRID = "sendgrid"
    CONSOLE = "console"  # For development - just logs emails


@dataclass
class EmailMessage:
    """Email message data class."""

    to_email: str
    subject: str
    body_text: str
    to_name: Optional[str] = None
    body_html: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    reply_to: Optional[str] = None
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None


class EmailConfig:
    """Email configuration from settings."""

    def __init__(self):
        # Import settings here to avoid circular import
        from core.config import settings

        email_settings = settings.email
        self.backend = EmailBackend(email_settings.EMAIL_BACKEND.lower())
        self.smtp_host = email_settings.SMTP_HOST or ""
        self.smtp_port = email_settings.SMTP_PORT
        self.smtp_user = email_settings.SMTP_USER or ""
        self.smtp_password = email_settings.SMTP_PASSWORD or ""
        self.smtp_use_tls = email_settings.SMTP_USE_TLS
        self.sendgrid_api_key = email_settings.SENDGRID_API_KEY or ""
        self.from_email = email_settings.EMAIL_FROM_ADDRESS
        self.from_name = email_settings.EMAIL_FROM_NAME

    def is_configured(self) -> bool:
        """Check if email is properly configured."""
        if self.backend == EmailBackend.CONSOLE:
            return True
        elif self.backend == EmailBackend.SMTP:
            return bool(self.smtp_host and self.smtp_user and self.smtp_password)
        elif self.backend == EmailBackend.SENDGRID:
            return bool(self.sendgrid_api_key)
        return False


class EmailService:
    """Service for sending emails."""

    def __init__(self, config: Optional[EmailConfig] = None):
        self.config = config or EmailConfig()
        self._enabled = self.config.is_configured()

        if not self._enabled:
            logger.warning("Email service not configured. Emails will not be sent.")

    @property
    def is_enabled(self) -> bool:
        return self._enabled

    def send(self, message: EmailMessage) -> bool:
        """Send an email message.

        Returns True if sent successfully, False otherwise.
        """
        if not self._enabled:
            logger.warning(
                f"Email not configured. Would send to {message.to_email}: {message.subject}"
            )
            return False

        # Set defaults
        if not message.from_email:
            message.from_email = self.config.from_email
        if not message.from_name:
            message.from_name = self.config.from_name

        try:
            if self.config.backend == EmailBackend.CONSOLE:
                return self._send_console(message)
            elif self.config.backend == EmailBackend.SMTP:
                return self._send_smtp(message)
            elif self.config.backend == EmailBackend.SENDGRID:
                return self._send_sendgrid(message)
            else:
                logger.error(f"Unknown email backend: {self.config.backend}")
                return False
        except Exception as e:
            logger.error(f"Failed to send email to {message.to_email}: {e}")
            return False

    def _send_console(self, message: EmailMessage) -> bool:
        """Log email to console (for development)."""
        to_display = (
            f"{message.to_name} <{message.to_email}>" if message.to_name else message.to_email
        )
        logger.info(
            f"""
========== EMAIL ==========
To: {to_display}
From: {message.from_name} <{message.from_email}>
Subject: {message.subject}
---------------------------
{message.body_text}
===========================
        """
        )
        return True

    def _send_smtp(self, message: EmailMessage) -> bool:
        """Send email via SMTP."""
        msg = MIMEMultipart("alternative")
        msg["Subject"] = message.subject
        msg["From"] = f"{message.from_name} <{message.from_email}>"
        msg["To"] = (
            f"{message.to_name} <{message.to_email}>" if message.to_name else message.to_email
        )

        if message.reply_to:
            msg["Reply-To"] = message.reply_to
        if message.cc:
            msg["Cc"] = ", ".join(message.cc)

        # Attach text and HTML parts
        msg.attach(MIMEText(message.body_text, "plain"))
        if message.body_html:
            msg.attach(MIMEText(message.body_html, "html"))

        # Build recipient list
        recipients = [message.to_email]
        if message.cc:
            recipients.extend(message.cc)
        if message.bcc:
            recipients.extend(message.bcc)

        # Send via SMTP
        with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port) as server:
            if self.config.smtp_use_tls:
                server.starttls()
            server.login(self.config.smtp_user, self.config.smtp_password)
            server.sendmail(message.from_email, recipients, msg.as_string())

        logger.info(f"Email sent via SMTP to {message.to_email}: {message.subject}")
        return True

    def _send_sendgrid(self, message: EmailMessage) -> bool:
        """Send email via SendGrid API."""
        try:
            import httpx
        except ImportError:
            logger.error("httpx not installed. Install with: pip install httpx")
            return False

        to_recipient = {"email": message.to_email}
        if message.to_name:
            to_recipient["name"] = message.to_name

        payload = {
            "personalizations": [{"to": [to_recipient]}],
            "from": {"email": message.from_email, "name": message.from_name},
            "subject": message.subject,
            "content": [{"type": "text/plain", "value": message.body_text}],
        }

        if message.body_html:
            payload["content"].append({"type": "text/html", "value": message.body_html})

        if message.reply_to:
            payload["reply_to"] = {"email": message.reply_to}

        response = httpx.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={
                "Authorization": f"Bearer {self.config.sendgrid_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30.0,
        )

        if response.status_code in (200, 202):
            logger.info(f"Email sent via SendGrid to {message.to_email}: {message.subject}")
            return True
        else:
            logger.error(f"SendGrid error {response.status_code}: {response.text}")
            return False


# Global email service instance
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Get or create the global email service instance."""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service


def send_email(
    to_email: str,
    subject: str,
    body_text: str,
    to_name: Optional[str] = None,
    body_html: Optional[str] = None,
    **kwargs,
) -> bool:
    """Convenience function to send an email.

    Args:
        to_email: Recipient email address
        subject: Email subject
        body_text: Plain text body
        to_name: Optional recipient name
        body_html: Optional HTML body
        **kwargs: Additional EmailMessage fields

    Returns:
        True if sent successfully
    """
    message = EmailMessage(
        to_email=to_email,
        subject=subject,
        body_text=body_text,
        to_name=to_name,
        body_html=body_html,
        **kwargs,
    )
    return get_email_service().send(message)
