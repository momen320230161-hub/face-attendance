import numpy as np
import pytest

from app.face import FaceEmbedder, FacePreprocessor
from app.face.models import FaceEmbeddingResult


def create_sample_face_image() -> bytes:
    import cv2

    img = np.ones((400, 400, 3), dtype=np.uint8) * 230
    cv2.ellipse(img, (200, 200), (50, 70), 0, 0, 360, (180, 150, 120), -1)
    cv2.circle(img, (185, 185), 6, (0, 0, 0), -1)
    cv2.circle(img, (215, 185), 6, (0, 0, 0), -1)
    cv2.ellipse(img, (200, 220), (15, 8), 0, 0, 180, (0, 0, 0), 2)
    _, encoded = cv2.imencode(".png", img)
    return encoded.tobytes()


def test_real_model_feature_extraction_and_inference():
    """Integration test verifying real feature extraction pipeline, dimension, norm, and finite checks."""
    img_bytes = create_sample_face_image()
    preprocessor = FacePreprocessor()

    # 1. Image loads successfully
    img = preprocessor.validate_image(img_bytes)
    assert img is not None
    assert img.shape[0] > 0 and img.shape[1] > 0

    # 2. Preprocess & extract face
    detection = preprocessor.preprocess(img, single_face_only=True)
    assert detection is not None
    assert detection.cropped_face is not None

    # 3. Generate embedding vector
    embedder = FaceEmbedder()
    res: FaceEmbeddingResult = embedder.encode(detection.cropped_face)

    # 4. Verify expected dimension (512)
    assert res.dimension == 512
    assert len(res.embedding) == 512

    # 5. Verify all values in embedding are finite
    arr = np.array(res.embedding, dtype=np.float32)
    assert np.all(np.isfinite(arr)), "Embedding vector contains NaN or Inf values"

    # 6. Verify L2 normalization: ||e||_2 == 1.0
    norm = float(np.linalg.norm(arr))
    assert abs(norm - 1.0) < 1e-3, f"Embedding vector is not unit normalized: norm={norm}"
