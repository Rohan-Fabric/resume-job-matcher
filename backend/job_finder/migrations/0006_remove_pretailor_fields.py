"""Drop source_url + status from TailoredResume — pretailor feature removed."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("job_finder", "0005_tailoredresume_pretailor_fields"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="tailoredresume",
            name="source_url",
        ),
        migrations.RemoveField(
            model_name="tailoredresume",
            name="status",
        ),
        migrations.AlterField(
            model_name="tailoredresume",
            name="content",
            field=models.TextField(),
        ),
    ]
