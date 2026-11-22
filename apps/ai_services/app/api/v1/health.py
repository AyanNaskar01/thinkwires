from fastapi import APIRouter, Response
from app.config import settings

router = APIRouter(tags=["Health & Status"])

@router.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Mute browser automatic favicon probing."""
    return Response(status_code=204)

@router.get("/")
def get_service_status():
    """Returns microservice health and version metadata (no sensitive secrets)."""
    return {
        "status": "online",
        "service": settings.APP_TITLE,
        "version": settings.APP_VERSION,
    }

@router.get("/health")
def health_check():
    """Lightweight Kubernetes / container liveness probe."""
    return {"status": "healthy"}

@router.get("/healthz")
def liveness_probe():
    """Lightweight unauthenticated liveness probe."""
    return {"status": "healthy"}
