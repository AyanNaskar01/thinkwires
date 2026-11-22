from typing import Optional
from fastapi import APIRouter, File, UploadFile, Form

from app.schemas.resume import (
    ParsedResumeResponse,
    ResumeMatchRequest,
    ResumeMatchResponse,
)
from app.services.resume_parser import parse_resume_content
from app.services.match_scorer import calculate_match_score

router = APIRouter(prefix="/api/resume", tags=["Resume Parsing & ATS Matching"])

@router.post("/parse", response_model=ParsedResumeResponse)
async def parse_resume_endpoint(
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
):
    """
    Parses resume from either an uploaded document (PDF/DOCX/TXT) or a raw text string.
    Local file_path parameter is deprecated to eliminate Local File Inclusion (LFI) risks (SEC-AI-01).
    """
    file_bytes = None
    filename = None
    if file:
        file_bytes = await file.read()
        filename = file.filename

    parsed = await parse_resume_content(
        file_bytes=file_bytes,
        filename=filename,
        raw_text=raw_text,
    )

    return ParsedResumeResponse(
        success=True,
        **parsed,
    )

@router.post("/match-score", response_model=ResumeMatchResponse)
async def calculate_match_score_endpoint(request: ResumeMatchRequest):
    """
    Computes candidate ATS Fit Score (0-100%) against job requisition
    using weighted dimensions per PRD Section 4.3.
    """
    return calculate_match_score(request)
