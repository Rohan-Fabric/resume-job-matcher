"""Input validation and output shaping for the API."""
from rest_framework import serializers

from .models import CandidateProfile, Resume


class ResumeUploadInputSerializer(serializers.Serializer):
    file = serializers.FileField()


class CandidateProfileOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateProfile
        fields = [
            "name", "email", "phone", "location", "country",
            "linkedin", "github", "skills", "titles", "years_experience", "search_role",
        ]


class ResumeOutputSerializer(serializers.ModelSerializer):
    """Resume + profile only. Matches (job results) are ephemeral and returned
    as plain dicts alongside this serializer's output by the search endpoint."""
    profile = CandidateProfileOutputSerializer(read_only=True)

    class Meta:
        model = Resume
        fields = ["id", "is_parsed", "created_date", "profile"]
