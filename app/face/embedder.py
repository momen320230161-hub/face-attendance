import numpy as np
from typing import Optional
import cv2
from app.face.models import FaceEmbeddingResult

# Singleton instance for real model
_insightface_app = None


def _get_insightface_app():
    global _insightface_app
    if _insightface_app is None:
        try:
            import insightface
            from insightface.app import FaceAnalysis

            app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "recognition"])
            app.prepare(ctx_id=-1, det_size=(640, 640))
            _insightface_app = app
        except Exception as e:
            raise RuntimeError(f"Real face recognition model (buffalo_l) failed to load: {e}")
    return _insightface_app


class FaceEmbedder:
    """Produces 512-dimensional normalized face embedding vectors using ArcFace (w600k_r50.onnx).
    Strictly fails if model weights or execution environment are unavailable.
    """

    def __init__(self, model_name: str = "ArcFace-buffalo_l", model_version: str = "v1.0"):
        self.model_name = model_name
        self.model_version = model_version
        self.dimension = 512

    def encode(self, face_image: np.ndarray) -> FaceEmbeddingResult:
        if face_image is None or face_image.size == 0:
            raise ValueError("Invalid face image for embedding generation")

        app = _get_insightface_app()

        # Ensure correct image dimensions & format for InsightFace (BGR, 3 channels)
        if len(face_image.shape) == 2:
            face_image_bgr = cv2.cvtColor(face_image, cv2.COLOR_GRAY2BGR)
        else:
            face_image_bgr = face_image

        # Run face analysis first
        faces = app.get(face_image_bgr)

        embedding_vec = None
        if faces and len(faces) > 0 and hasattr(faces[0], "embedding") and faces[0].embedding is not None:
            embedding_vec = faces[0].embedding.astype(np.float32).flatten()
        else:
            # Directly extract ArcFace embedding from cropped face via ONNX recognition model w600k_r50
            rec_model = app.models.get("recognition")
            if rec_model is not None:
                # Resize crop to 112x112 expected input format for ArcFace
                if face_image_bgr.shape[:2] != (112, 112):
                    resized_crop = cv2.resize(face_image_bgr, (112, 112))
                else:
                    resized_crop = face_image_bgr

                raw_feat = rec_model.get_feat(resized_crop)
                if isinstance(raw_feat, np.ndarray):
                    embedding_vec = raw_feat.flatten().astype(np.float32)
                else:
                    raise RuntimeError("Failed to extract feature vector from ArcFace recognition model")
            else:
                raise RuntimeError("Face recognition model w600k_r50 is unavailable")

        if embedding_vec is None or len(embedding_vec) != self.dimension:
            raise RuntimeError(f"Invalid embedding dimension from model: expected {self.dimension}")

        # Verify finite values
        if not np.all(np.isfinite(embedding_vec)):
            raise RuntimeError("Generated face embedding contains non-finite values (NaN or Inf)")

        # L2 Normalization: ||vector||_2 = 1.0
        norm = np.linalg.norm(embedding_vec)
        if norm > 0:
            normalized_vec = (embedding_vec / norm).tolist()
        else:
            raise RuntimeError("Generated embedding has zero norm")

        return FaceEmbeddingResult(
            embedding=normalized_vec,
            model_name=self.model_name,
            model_version=self.model_version,
            dimension=self.dimension,
        )
