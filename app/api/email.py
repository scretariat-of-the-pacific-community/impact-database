"""
Email API endpoint using Microsoft Graph API
"""
import base64
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from sqlalchemy.ext.asyncio import AsyncSession
import msal
import requests

from models.database import get_db
from api.auth_rbac import EnhancedUser, get_current_user_enhanced
from core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])


def draft_attachment(file: UploadFile):
    """Convert uploaded file to Microsoft Graph attachment format"""
    content = file.file.read()
    media_content = base64.b64encode(content)
    return {
        '@odata.type': '#microsoft.graph.fileAttachment',
        'contentBytes': media_content.decode('utf-8'),
        'name': file.filename
    }


async def send_notification_email(to: str, subject: str, body: str):
    """
    Send email notification using Microsoft Graph API
    
    Args:
        to: Comma-separated list of recipient emails
        subject: Email subject
        body: Email body (HTML)
    
    Returns:
        APIResponse with success status
    """
    # Acquire token using MSAL
    app = msal.ConfidentialClientApplication(
        settings.email.MSGRAPH_CLIENT_ID,
        authority=settings.email.MSGRAPH_AUTHORITY_URL,
        client_credential=settings.email.MSGRAPH_CLIENT_SECRET
    )
    scopes = [settings.email.MSGRAPH_SCOPES]
    result = app.acquire_token_for_client(scopes=scopes)
    
    if "access_token" not in result:
        error_msg = result.get('error_description', result)
        logger.error(f"Could not acquire access token: {error_msg}")
        raise Exception(f"Could not acquire access token: {error_msg}")
    
    access_token = result["access_token"]

    # Prepare recipients
    recip = [{'EmailAddress': {'Address': email.strip()}} for email in to.split(",") if email.strip()]

    # Prepare email message
    email_msg = {
        'Message': {
            'Subject': subject,
            'Body': {'ContentType': 'Html', 'Content': body},
            'ToRecipients': recip,
            'From': {
                'EmailAddress': {
                    'Address': settings.email.EMAIL_FROM_ADDRESS,
                    'Name': settings.email.EMAIL_FROM_NAME
                }
            }
        },
        'SaveToSentItems': 'true'
    }

    # Send email via Microsoft Graph API
    userId = settings.email.EMAIL_FROM_ADDRESS
    endpoint = f'https://graph.microsoft.com/v1.0/users/{userId}/sendMail'
    headers = {'Authorization': f'Bearer {access_token}'}
    
    response = requests.post(endpoint, headers=headers, json=email_msg)
    
    if not response.ok:
        logger.error(f"Failed to send email: {response.text}")
        raise Exception(f"Failed to send email: {response.text}")
    
    return {"status": "success", "message": "Email sent successfully"}


@router.post("/send")
async def send_email(
    to: str = Body(..., description="Comma-separated list of recipient emails"),
    subject: str = Body(...),
    body: str = Body(...),
    attachments: List[UploadFile] = File([]),
    db: AsyncSession = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """
    Send email with optional attachments using Microsoft Graph API
    
    Requires authentication.
    """
    # Check if email backend is configured
    if settings.email.EMAIL_BACKEND != "msgraph":
        raise HTTPException(
            status_code=503,
            detail="Email service is not configured with Microsoft Graph backend"
        )
    
    # Acquire token using MSAL
    app = msal.ConfidentialClientApplication(
        settings.email.MSGRAPH_CLIENT_ID,
        authority=settings.email.MSGRAPH_AUTHORITY_URL,
        client_credential=settings.email.MSGRAPH_CLIENT_SECRET
    )
    scopes = [settings.email.MSGRAPH_SCOPES]
    result = app.acquire_token_for_client(scopes=scopes)
    
    if "access_token" not in result:
        error_msg = result.get('error_description', result)
        logger.error(f"Could not acquire access token: {error_msg}")
        raise HTTPException(
            status_code=500,
            detail=f"Could not acquire access token: {error_msg}"
        )
    
    access_token = result["access_token"]

    # Prepare recipients (split comma-separated string)
    recip = [{'EmailAddress': {'Address': email.strip()}} for email in to.split(",") if email.strip()]

    # Prepare attachments
    attachment_arr = []
    for file in attachments:
        attachment_arr.append(draft_attachment(file))

    # Prepare the email payload
    email_msg = {
        'Message': {
            'Subject': subject,
            'Body': {'ContentType': 'Html', 'Content': body},
            'ToRecipients': recip,
            'attachments': attachment_arr,
            'From': {
                'EmailAddress': {
                    'Address': settings.email.EMAIL_FROM_ADDRESS,
                    'Name': settings.email.EMAIL_FROM_NAME
                }
            }
        },
        'SaveToSentItems': 'true'
    }

    # Send the email via Microsoft Graph API
    userId = settings.email.EMAIL_FROM_ADDRESS
    endpoint = f'https://graph.microsoft.com/v1.0/users/{userId}/sendMail'
    headers = {'Authorization': f'Bearer {access_token}'}
    
    response = requests.post(endpoint, headers=headers, json=email_msg)
    
    if response.ok:
        logger.info(f"Email sent successfully to {to} by user {current_user.email}")
        return {"status": "success", "message": "Email sent successfully"}
    else:
        logger.error(f"Failed to send email: {response.text}")
        raise HTTPException(status_code=response.status_code, detail=response.text)
