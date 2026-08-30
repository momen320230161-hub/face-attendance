from datetime import datetime
from enum import Enum
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SessionStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class RecordStatus(str, Enum):
    PRESENT = "present"
    LATE = "late"
    ABSENT = "absent"
    EXCUSED = "excused"


class RecognitionSource(str, Enum):
    FACE_RECOGNITION = "face_recognition"
    MANUAL = "manual"
    SYSTEM = "system"


class AttendanceSessionCreate(BaseModel):
    course_id: UUID
    started_at: datetime | None = None
    status: SessionStatus = SessionStatus.OPEN


class AttendanceSessionResponse(BaseModel):
    id: UUID
    course_id: UUID
    started_at: datetime
    ended_at: datetime | None = None
    status: SessionStatus
    created_at: datetime
    created_by: UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class AttendanceRecordCreate(BaseModel):
    session_id: UUID
    student_id: UUID
    status: RecordStatus = RecordStatus.PRESENT
    recognized_at: datetime | None = None
    confidence: float | None = Field(None, ge=0.0, le=1.0, description="Confidence score between 0.0 and 1.0")
    recognition_source: RecognitionSource = RecognitionSource.SYSTEM

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v: float | None) -> float | None:
        if v is not None:
            if not (0.0 <= v <= 1.0):
                raise ValueError("Confidence must be between 0.0 and 1.0")
        return v


class AttendanceRecordResponse(BaseModel):
    id: UUID
    session_id: UUID
    student_id: UUID
    status: RecordStatus
    recognized_at: datetime | None = None
    confidence: float | None = None
    similarity: float | None = None
    recognition_source: RecognitionSource
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    def model_post_init(self, __context):
        if self.similarity is None and self.confidence is not None:
            self.similarity = self.confidence

