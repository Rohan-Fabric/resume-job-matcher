from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('job_finder', '0002_job_metadata_and_scoring'),
    ]

    operations = [
        migrations.AddField(
            model_name='candidateprofile',
            name='search_role',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
