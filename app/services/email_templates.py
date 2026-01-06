"""Email templates for notifications.

Provides HTML and text templates for common notification types.
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class EmailTemplate:
    """Email template with subject, text, and HTML versions."""

    subject: str
    body_text: str
    body_html: str


# Base HTML template with styling
BASE_HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
        }}
        .container {{
            max-width: 600px;
            margin: 20px auto;
            background: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }}
        .header .subtitle {{
            opacity: 0.9;
            font-size: 14px;
            margin-top: 5px;
        }}
        .content {{
            padding: 30px;
        }}
        .content h2 {{
            color: #1e3a5f;
            margin-top: 0;
        }}
        .button {{
            display: inline-block;
            background: #0ea5e9;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            margin: 20px 0;
        }}
        .button:hover {{
            background: #0284c7;
        }}
        .footer {{
            background: #f8fafc;
            padding: 20px 30px;
            text-align: center;
            font-size: 12px;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
        }}
        .footer a {{
            color: #0ea5e9;
            text-decoration: none;
        }}
        .info-box {{
            background: #f0f9ff;
            border-left: 4px solid #0ea5e9;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 4px 4px 0;
        }}
        .success-box {{
            background: #f0fdf4;
            border-left: 4px solid #22c55e;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 4px 4px 0;
        }}
        .warning-box {{
            background: #fefce8;
            border-left: 4px solid #eab308;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 4px 4px 0;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌊 Impact Database</h1>
            <div class="subtitle">Pacific Environmental Monitoring</div>
        </div>
        <div class="content">
            {content}
        </div>
        <div class="footer">
            <p>You received this email because you're a member of Impact Database.</p>
            <p><a href="{{settings_url}}">Manage notification preferences</a></p>
            <p>© 2026 Impact Database. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
"""


def _render_html(subject: str, content: str, settings_url: str = "") -> str:
    """Render content into the base HTML template."""
    return BASE_HTML_TEMPLATE.format(
        subject=subject, content=content, settings_url=settings_url or "#"
    )


class EmailTemplates:
    """Collection of email templates."""

    @staticmethod
    def welcome(username: str, login_url: str = "") -> EmailTemplate:
        """Welcome email for new users."""
        subject = "Welcome to Impact Database! 🌊"

        text = f"""
Welcome to Impact Database, {username}!

Thank you for joining the Pacific Environmental Monitoring community.

With Impact Database, you can:
- Upload and share environmental hazard images
- Contribute to regional disaster monitoring
- Track your impact with detailed analytics
- Earn achievements for your contributions

Get started by uploading your first image:
{login_url}

If you have any questions, feel free to reach out to our support team.

Best regards,
The Impact Database Team
        """

        html_content = f"""
<h2>Welcome, {username}! 👋</h2>
<p>Thank you for joining the Pacific Environmental Monitoring community.</p>

<div class="info-box">
    <strong>With Impact Database, you can:</strong>
    <ul>
        <li>Upload and share environmental hazard images</li>
        <li>Contribute to regional disaster monitoring</li>
        <li>Track your impact with detailed analytics</li>
        <li>Earn achievements for your contributions</li>
    </ul>
</div>

<p>Get started by uploading your first image:</p>
<a href="{login_url}" class="button">Go to Dashboard</a>

<p>If you have any questions, feel free to reach out to our support team.</p>

<p>Best regards,<br>The Impact Database Team</p>
        """

        return EmailTemplate(
            subject=subject, body_text=text.strip(), body_html=_render_html(subject, html_content)
        )

    @staticmethod
    def upload_approved(
        username: str, image_title: str, image_url: str = "", reviewer_comment: Optional[str] = None
    ) -> EmailTemplate:
        """Notification when an upload is approved."""
        subject = f"Your upload has been approved! ✅"

        comment_text = f"\nReviewer comment: {reviewer_comment}" if reviewer_comment else ""

        text = f"""
Good news, {username}!

Your upload "{image_title}" has been approved and is now publicly visible.
{comment_text}

View your image: {image_url}

Thank you for contributing to environmental monitoring in the Pacific region!

Best regards,
The Impact Database Team
        """

        comment_html = (
            f'<div class="success-box"><strong>Reviewer comment:</strong> {reviewer_comment}</div>'
            if reviewer_comment
            else ""
        )

        html_content = f"""
<h2>Great news! ✅</h2>
<p>Hi {username},</p>

<p>Your upload <strong>"{image_title}"</strong> has been approved and is now publicly visible.</p>

{comment_html}

<a href="{image_url}" class="button">View Your Image</a>

<p>Thank you for contributing to environmental monitoring in the Pacific region!</p>

<p>Best regards,<br>The Impact Database Team</p>
        """

        return EmailTemplate(
            subject=subject, body_text=text.strip(), body_html=_render_html(subject, html_content)
        )

    @staticmethod
    def upload_rejected(
        username: str, image_title: str, rejection_reason: str, resubmit_url: str = ""
    ) -> EmailTemplate:
        """Notification when an upload is rejected."""
        subject = f"Upload requires changes"

        text = f"""
Hi {username},

Your upload "{image_title}" requires some changes before it can be approved.

Reason: {rejection_reason}

You can edit and resubmit your upload here: {resubmit_url}

If you have questions about the feedback, please contact our support team.

Best regards,
The Impact Database Team
        """

        html_content = f"""
<h2>Changes Requested</h2>
<p>Hi {username},</p>

<p>Your upload <strong>"{image_title}"</strong> requires some changes before it can be approved.</p>

<div class="warning-box">
    <strong>Reason:</strong><br>
    {rejection_reason}
</div>

<a href="{resubmit_url}" class="button">Edit & Resubmit</a>

<p>If you have questions about the feedback, please contact our support team.</p>

<p>Best regards,<br>The Impact Database Team</p>
        """

        return EmailTemplate(
            subject=subject, body_text=text.strip(), body_html=_render_html(subject, html_content)
        )

    @staticmethod
    def achievement_unlocked(
        username: str,
        achievement_name: str,
        achievement_description: str,
        points: int,
        profile_url: str = "",
    ) -> EmailTemplate:
        """Notification when user unlocks an achievement."""
        subject = f"Achievement Unlocked: {achievement_name}! 🏆"

        text = f"""
Congratulations, {username}!

You've unlocked a new achievement:

🏆 {achievement_name}
{achievement_description}

Points earned: +{points}

View all your achievements: {profile_url}

Keep up the great work!

Best regards,
The Impact Database Team
        """

        html_content = f"""
<h2>🏆 Achievement Unlocked!</h2>
<p>Congratulations, {username}!</p>

<div class="success-box">
    <h3 style="margin-top: 0;">{achievement_name}</h3>
    <p>{achievement_description}</p>
    <p><strong>Points earned: +{points}</strong></p>
</div>

<a href="{profile_url}" class="button">View All Achievements</a>

<p>Keep up the great work!</p>

<p>Best regards,<br>The Impact Database Team</p>
        """

        return EmailTemplate(
            subject=subject, body_text=text.strip(), body_html=_render_html(subject, html_content)
        )

    @staticmethod
    def review_assigned(
        reviewer_name: str, image_title: str, uploader_name: str, review_url: str = ""
    ) -> EmailTemplate:
        """Notification when a review is assigned to a curator."""
        subject = f"New image ready for review"

        text = f"""
Hi {reviewer_name},

A new image is ready for your review:

Image: {image_title}
Uploaded by: {uploader_name}

Review it here: {review_url}

Thank you for your contributions to content curation!

Best regards,
The Impact Database Team
        """

        html_content = f"""
<h2>New Review Assignment</h2>
<p>Hi {reviewer_name},</p>

<p>A new image is ready for your review:</p>

<div class="info-box">
    <strong>Image:</strong> {image_title}<br>
    <strong>Uploaded by:</strong> {uploader_name}
</div>

<a href="{review_url}" class="button">Start Review</a>

<p>Thank you for your contributions to content curation!</p>

<p>Best regards,<br>The Impact Database Team</p>
        """

        return EmailTemplate(
            subject=subject, body_text=text.strip(), body_html=_render_html(subject, html_content)
        )

    @staticmethod
    def password_reset(username: str, reset_url: str, expires_in: str = "1 hour") -> EmailTemplate:
        """Password reset email."""
        subject = "Reset your password"

        text = f"""
Hi {username},

We received a request to reset your password for your Impact Database account.

Click the link below to reset your password:
{reset_url}

This link will expire in {expires_in}.

If you didn't request this, you can safely ignore this email. Your password will not be changed.

Best regards,
The Impact Database Team
        """

        html_content = f"""
<h2>Password Reset Request</h2>
<p>Hi {username},</p>

<p>We received a request to reset your password for your Impact Database account.</p>

<a href="{reset_url}" class="button">Reset Password</a>

<div class="info-box">
    This link will expire in <strong>{expires_in}</strong>.
</div>

<p>If you didn't request this, you can safely ignore this email. Your password will not be changed.</p>

<p>Best regards,<br>The Impact Database Team</p>
        """

        return EmailTemplate(
            subject=subject, body_text=text.strip(), body_html=_render_html(subject, html_content)
        )

    @staticmethod
    def weekly_digest(
        username: str, stats: Dict[str, Any], dashboard_url: str = ""
    ) -> EmailTemplate:
        """Weekly activity digest email."""
        subject = "Your Weekly Impact Summary 📊"

        uploads = stats.get("uploads", 0)
        approved = stats.get("approved", 0)
        views = stats.get("views", 0)
        achievements = stats.get("new_achievements", [])

        achievements_text = (
            "\n".join([f"  🏆 {a}" for a in achievements]) if achievements else "  None this week"
        )

        text = f"""
Hi {username},

Here's your weekly activity summary:

📤 Uploads: {uploads}
✅ Approved: {approved}
👁️ Total views: {views}

New achievements:
{achievements_text}

View your full dashboard: {dashboard_url}

Keep up the great work!

Best regards,
The Impact Database Team
        """

        achievements_html = (
            "".join([f"<li>🏆 {a}</li>" for a in achievements])
            if achievements
            else "<li>None this week</li>"
        )

        html_content = f"""
<h2>Your Weekly Impact Summary 📊</h2>
<p>Hi {username},</p>

<p>Here's your activity summary for the past week:</p>

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr>
        <td style="padding: 15px; background: #f0f9ff; border-radius: 8px; text-align: center;">
            <div style="font-size: 32px; font-weight: bold; color: #0ea5e9;">{uploads}</div>
            <div style="color: #64748b;">Uploads</div>
        </td>
        <td style="width: 10px;"></td>
        <td style="padding: 15px; background: #f0fdf4; border-radius: 8px; text-align: center;">
            <div style="font-size: 32px; font-weight: bold; color: #22c55e;">{approved}</div>
            <div style="color: #64748b;">Approved</div>
        </td>
        <td style="width: 10px;"></td>
        <td style="padding: 15px; background: #faf5ff; border-radius: 8px; text-align: center;">
            <div style="font-size: 32px; font-weight: bold; color: #a855f7;">{views}</div>
            <div style="color: #64748b;">Views</div>
        </td>
    </tr>
</table>

<div class="info-box">
    <strong>New Achievements:</strong>
    <ul style="margin: 10px 0 0 0; padding-left: 20px;">
        {achievements_html}
    </ul>
</div>

<a href="{dashboard_url}" class="button">View Full Dashboard</a>

<p>Keep up the great work!</p>

<p>Best regards,<br>The Impact Database Team</p>
        """

        return EmailTemplate(
            subject=subject, body_text=text.strip(), body_html=_render_html(subject, html_content)
        )
