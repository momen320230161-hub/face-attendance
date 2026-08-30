from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


class CourseCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50, description="Unique course code e.g. CS101")
    name: str = Field(..., min_length=1, max_length=200, description="Course name e.g. Introduction to Computer Science")
    description: str | None = Field(None, max_length=1000, description="Optional course description")

    @field_validator("code")
    @classmethod
    def clean_code(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if not cleaned:
            raise ValueError("Course code cannot be empty or whitespace only")
        return cleaned

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Course name cannot be empty or whitespace only")
        return cleaned


class CourseUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=50)
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=1000)

    @field_validator("code")
    @classmethod
    def clean_code(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip().upper()
            if not cleaned:
                raise ValueError("Course code cannot be empty")
            return cleaned
        return v

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                raise ValueError("Course name cannot be empty")
            return cleaned
        return v


class CourseResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: str | None = None
    created_at: datetime
    created_by: UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class EnrollmentCreate(BaseModel):
    student_id: UUID


class EnrollmentResponse(BaseModel):
    id: UUID
    course_id: UUID
    student_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StudentProfileSummary(BaseModel):
    id: UUID
    full_name: str | None = None
    email: str | None = None
    role: str = "user"

    model_config = ConfigDict(from_attributes=True)
