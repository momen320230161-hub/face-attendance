from dataclasses import dataclass
from typing import List, Optional
import numpy as np
from pydantic import BaseModel, ConfigDict, Field


@dataclass
class FaceBoundingBox:
    x: int
    y: int
    width: int
    height: int


@dataclass
class FaceDetectionResult:
    bounding_box: FaceBoundingBox
    confidence: float
    cropped_face: Optional[np.ndarray] = None


class FaceEmbeddingResult(BaseModel):
    embedding: List[float] = Field(..., description="Normalized 512-dim embedding vector")
    model_name: str = Field(default="ArcFace-buffalo_l")
    model_version: str = Field(default="v1.0")
    dimension: int = Field(default=512)

    model_config = ConfigDict(arbitrary_types_allowed=True)


class MatchResult(BaseModel):
    matched: bool
    student_id: Optional[str] = None
    similarity: float = Field(..., description="Cosine similarity score")
    threshold: float = Field(..., description="Cosine similarity threshold applied")
