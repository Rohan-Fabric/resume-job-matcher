from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('job_finder', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobmatch',
            name='posted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='salary_raw',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='salary_min',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='salary_max',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='currency',
            field=models.CharField(blank=True, max_length=8),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='salary_period',
            field=models.CharField(blank=True, max_length=16),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='job_type',
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='source',
            field=models.CharField(blank=True, max_length=16),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='experience_fit',
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='one_line_summary',
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='matched_skills',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='missing_skills',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
