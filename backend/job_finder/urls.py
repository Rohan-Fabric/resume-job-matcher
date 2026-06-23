"""Routes for job_finder."""
from rest_framework.routers import DefaultRouter

from .views import JobMatchViewSet, ResumeViewSet

router = DefaultRouter()
router.register(r"resumes", ResumeViewSet, basename="resume")
router.register(r"matches", JobMatchViewSet, basename="match")

urlpatterns = router.urls
