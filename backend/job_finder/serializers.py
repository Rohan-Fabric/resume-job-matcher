"""Input validation and output shaping for the API."""
from rest_framework import serializers

from .models import CandidateProfile, JobMatch, Resume, TailoredResume


class ResumeUploadInputSerializer(serializers.Serializer):
    file = serializers.FileField()


class CandidateProfileOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateProfile
        fields = [
            "name", "email", "phone", "location",
            "country", "skills", "titles", "years_experience",
        ]


class JobMatchOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobMatch
        fields = [
            "id", "title", "company", "source_url",
            "is_remote", "country", "tier", "fit_score", "reasoning",
        ]


class ResumeOutputSerializer(serializers.ModelSerializer):
    profile = CandidateProfileOutputSerializer(read_only=True)
    matches = JobMatchOutputSerializer(many=True, read_only=True)

    class Meta:
        model = Resume
        fields = ["id", "is_parsed", "created_date", "profile", "matches"]


class TailoredResumeOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = TailoredResume
        fields = ["id", "job_match", "content", "created_date"]
