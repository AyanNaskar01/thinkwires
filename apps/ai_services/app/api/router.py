from fastapi import APIRouter, Depends
from app.api.v1.health import router as health_router
from app.api.v1.resume import router as resume_router
from app.api.v1.screening import router as screening_router
from app.api.deps import verify_internal_api_key

api_router = APIRouter()

# Mount public liveness and health probes (unauthenticated, zero sensitive data)
api_router.include_router(health_router)

# Mount internal AI service endpoints protected by X-Internal-AI-Key authentication
api_router.include_router(
    resume_router,
    dependencies=[Depends(verify_internal_api_key)],
)
api_router.include_router(
    screening_router,
    dependencies=[Depends(verify_internal_api_key)],
)
