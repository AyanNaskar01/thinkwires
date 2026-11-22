import hmac
import logging
from typing import Optional
from fastapi import Header, HTTPException, status
from app.config import settings

logger = logging.getLogger("thinkwires.ai_services.security")

async def verify_internal_api_key(
    x_internal_ai_key: Optional[str] = Header(None, alias="X-Internal-AI-Key")
) -> str:
    """
    Enforces service-to-service authentication for internal AI microservice endpoints.
    Uses hmac.compare_digest() for constant-time comparison against timing attacks.
    Missing or invalid credentials are systematically rejected with HTTP 401 Unauthorized.
    """
    expected_secret = settings.INTERNAL_AI_SECRET
    if not expected_secret:
        logger.error("[Security] INTERNAL_AI_SECRET is not configured on the AI microservice.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal service authentication misconfigured.",
        )

    if not x_internal_ai_key or not isinstance(x_internal_ai_key, str) or not x_internal_ai_key.strip():
        logger.warning("[Security] Rejected AI service request: Missing X-Internal-AI-Key header.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Missing X-Internal-AI-Key header.",
        )

    # Constant-time comparison to prevent side-channel timing leaks
    if not hmac.compare_digest(x_internal_ai_key.strip(), expected_secret.strip()):
        logger.warning("[Security] Rejected AI service request: Invalid X-Internal-AI-Key header.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Invalid X-Internal-AI-Key header.",
        )

    return x_internal_ai_key.strip()
