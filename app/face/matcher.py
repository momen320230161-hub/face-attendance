from typing import Dict, List, Optional
import numpy as np
from app.config import get_settings
from app.face.models import MatchResult


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    a = np.asarray(v1, dtype=np.float32)
    b = np.asarray(v2, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    sim = float(np.dot(a, b) / (norm_a * norm_b))
    # Bound between 0.0 and 1.0
    return max(0.0, min(1.0, sim))


class FaceMatcher:
    """Matches a query face embedding vector against a set of enrolled student face embeddings
    using Cosine Similarity with configurable threshold evaluation.
    """

    def __init__(self, default_threshold: Optional[float] = None):
        self._default_threshold = default_threshold

    @property
    def threshold(self) -> float:
        if self._default_threshold is not None:
            return self._default_threshold
        return get_settings().match_threshold

    def match(
        self,
        query_embedding: List[float],
        enrolled_embeddings: Dict[str, List[float]],
        threshold: Optional[float] = None,
    ) -> MatchResult:
        applied_threshold = threshold if threshold is not None else self.threshold

        if not query_embedding or not enrolled_embeddings:
            return MatchResult(
                matched=False,
                student_id=None,
                similarity=0.0,
                threshold=applied_threshold,
            )

        best_student_id: Optional[str] = None
        best_similarity: float = 0.0

        for student_id, enrolled_vec in enrolled_embeddings.items():
            sim = cosine_similarity(query_embedding, enrolled_vec)
            if sim > best_similarity:
                best_similarity = sim
                best_student_id = student_id

        matched = best_similarity >= applied_threshold and best_student_id is not None

        return MatchResult(
            matched=matched,
            student_id=best_student_id if matched else None,
            similarity=round(best_similarity, 4),
            threshold=applied_threshold,
        )
