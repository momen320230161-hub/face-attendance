from datetime import datetime, timedelta, timezone

from .config import get_settings
from .db import get_supabase

_last_seen: dict[str, datetime] = {}


def record_check_in(person_id: str, confidence: float) -> bool:
    now = datetime.now(timezone.utc)
    previous = _last_seen.get(person_id)
    if previous and now - previous < timedelta(minutes=get_settings().debounce_minutes):
        return False

    get_supabase().table("attendance_log").insert(
        {"person_id": person_id, "confidence": confidence}
    ).execute()
    _last_seen[person_id] = now
    return True

