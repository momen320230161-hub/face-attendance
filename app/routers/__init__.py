from .courses import router as courses_router
from .attendance import router as attendance_router
from .recognition import router as recognition_router
from .admin import router as admin_router
from .reports import router as reports_router

__all__ = ["courses_router", "attendance_router", "recognition_router", "admin_router", "reports_router"]


