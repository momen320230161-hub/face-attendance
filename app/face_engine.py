from functools import lru_cache

import cv2
import numpy as np
from fastapi import HTTPException

from .config import get_settings


@lru_cache
def get_face_app():
    # Delayed import avoids downloading/loading the model when importing the API package.
    from insightface.app import FaceAnalysis

    app = FaceAnalysis(name="buffalo_l")
    app.prepare(ctx_id=get_settings().insightface_ctx_id, det_size=(640, 640))
    return app


def decode_image(contents: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=422, detail="Uploaded file is not a valid image")
    return image


def get_face_embeddings(image: np.ndarray) -> list[list[float]]:
    return [face.embedding.astype(float).tolist() for face in get_face_app().get(image)]


def get_single_embedding(image: np.ndarray) -> list[float]:
    embeddings = get_face_embeddings(image)
    if len(embeddings) == 0:
        raise HTTPException(status_code=422, detail="No face detected in image")
    if len(embeddings) > 1:
        raise HTTPException(status_code=422, detail="Exactly one face must appear in each enrollment image")
    return embeddings[0]


def average_embeddings(embeddings: list[list[float]]) -> list[float]:
    vector = np.mean(np.asarray(embeddings, dtype=np.float32), axis=0)
    norm = np.linalg.norm(vector)
    if norm == 0:
        raise HTTPException(status_code=422, detail="Could not create a valid face embedding")
    return (vector / norm).astype(float).tolist()

