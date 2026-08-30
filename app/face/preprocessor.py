import cv2
import numpy as np
from fastapi import HTTPException, status
from app.face.detector import FaceDetector
from app.face.models import FaceDetectionResult


class FacePreprocessor:
    """Preprocesses input images, validates decoding, and enforces single-face detection constraints."""

    def __init__(self, detector: FaceDetector | None = None):
        self.detector = detector or FaceDetector()

    def validate_image(self, contents: bytes) -> np.ndarray:
        if not contents or len(contents) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Empty image content provided",
            )
        image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
        if image is None or image.size == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Uploaded file is not a valid image or could not be decoded",
            )
        return image

    def preprocess(self, image: np.ndarray, single_face_only: bool = True) -> FaceDetectionResult:
        faces = self.detector.detect(image)

        if len(faces) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No face detected in image",
            )

        if single_face_only and len(faces) > 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Multiple faces detected in image. Exactly one face must be present.",
            )

        return faces[0]
