"""Email service using SendGrid."""
import os
import logging
from typing import Optional

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content

logger = logging.getLogger("email")


def _client() -> Optional[SendGridAPIClient]:
    key = os.environ.get("SENDGRID_API_KEY")
    if not key:
        return None
    return SendGridAPIClient(key)


def _from():
    return Email(
        email=os.environ.get("SENDGRID_FROM_EMAIL", "no-reply@example.com"),
        name=os.environ.get("SENDGRID_FROM_NAME", "Attendance System"),
    )


def send_email(to_email: str, subject: str, html: str) -> bool:
    sg = _client()
    if not sg:
        logger.warning("SENDGRID not configured; skipping email to %s", to_email)
        return False
    try:
        msg = Mail(
            from_email=_from(),
            to_emails=To(to_email),
            subject=subject,
            html_content=Content("text/html", html),
        )
        resp = sg.send(msg)
        logger.info("email sent to=%s status=%s", to_email, resp.status_code)
        return 200 <= resp.status_code < 300
    except Exception as e:
        logger.exception("email send failed: %s", e)
        return False


def teacher_approved(name: str, employee_id: str, default_password: str) -> str:
    return f"""
    <h2>Your account is approved</h2>
    <p>Hi {name},</p>
    <p>Your teacher registration with Employee ID <b>{employee_id}</b> has been approved by admin.</p>
    <p><b>Default password:</b> <code>{default_password}</code></p>
    <p>You'll be asked to change this password on first login.</p>
    <p>— KLE Attendance</p>
    """


def teacher_rejected(name: str, employee_id: str) -> str:
    return f"""
    <h2>Registration rejected</h2>
    <p>Hi {name},</p>
    <p>Your teacher registration with Employee ID <b>{employee_id}</b> was rejected by admin.</p>
    <p>Please contact your institute administrator for details.</p>
    """


def password_changed(name: str) -> str:
    return f"""
    <h2>Password changed</h2>
    <p>Hi {name},</p>
    <p>Your account password was just changed. If this wasn't you, contact admin immediately.</p>
    """


def otp_email(name: str, otp: str) -> str:
    return f"""
    <h2>Password Reset Code</h2>
    <p>Hi {name},</p>
    <p>Use this one-time code to reset your password. It expires in 15 minutes.</p>
    <h1 style="letter-spacing:6px;font-family:monospace">{otp}</h1>
    <p>If you didn't request this, you can safely ignore this email.</p>
    """
