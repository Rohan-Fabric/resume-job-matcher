"""Add source_url + status to TailoredResume for pretailor caching."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("job_finder", "0004_drop_jobmatch_refactor_tailoredresume"),
    ]

    operations = [
        migrations.AddField(
            model_name="tailoredresume",
            name="source_url",
            field=models.CharField(blank=True, max_length=500, default=""),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="tailoredresume",
            name="status",
            field=models.CharField(default="pending", max_length=16),
        ),
        migrations.AlterField(
            model_name="tailoredresume",
            name="content",
            field=models.TextField(blank=True),
        ),
    ]
