from typing import Dict, List, Optional
from app.face.detector import FaceDetector
from app.face.embedder import FaceEmbedder
from app.face.matcher import FaceMatcher
from app.face.models import FaceEmbeddingResult, MatchResult
from app.face.preprocessor import FacePreprocessor


class FaceRecognitionService:
    """High-level face recognition service wrapping detection, preprocessing, embedding, and matching."""

    def __init__(
        self,
        detector: Optional[FaceDetector] = None,
        preprocessor: Optional[FacePreprocessor] = None,
        embedder: Optional[FaceEmbedder] = None,
        matcher: Optional[FaceMatcher] = None,
    ):
        self.detector = detector or FaceDetector()
        self.preprocessor = preprocessor or FacePreprocessor(detector=self.detector)
        self.embedder = embedder or FaceEmbedder()
        self.matcher = matcher or FaceMatcher()

    def generate_embedding_from_bytes(self, image_bytes: bytes) -> FaceEmbeddingResult:
        image = self.preprocessor.validate_image(image_bytes)
        detection = self.preprocessor.preprocess(image, single_face_only=True)
        return self.embedder.encode(detection.cropped_face)

    def match_face_from_bytes(
        self,
        image_bytes: bytes,
        enrolled_embeddings: Dict[str, List[float]],
        threshold: Optional[float] = None,
    ) -> MatchResult:
        embedding_result = self.generate_embedding_from_bytes(image_bytes)
        return self.matcher.match(
            query_embedding=embedding_result.embedding,
            enrolled_embeddings=enrolled_embeddings,
            threshold=threshold,
        )


_face_recognition_service_instance: Optional[FaceRecognitionService] = None


def get_face_recognition_service() -> FaceRecognitionService:
    global _face_recognition_service_instance
    if _face_recognition_service_instance is None:
        _face_recognition_service_instance = FaceRecognitionService()
    return _face_recognition_service_instance
