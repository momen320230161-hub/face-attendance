from .config import get_settings
from .db import get_supabase


def match_face(query_embedding: list[float]) -> dict | None:
    result = get_supabase().rpc(
        "match_person",
        {"query_embedding": query_embedding, "match_threshold": get_settings().match_threshold},
    ).execute()
    return result.data[0] if result.data else None

