"""Drop JobMatch; refactor TailoredResume to store job context inline.

Job results are now ephemeral (fetch → score → return → forget), so JobMatch
has no reason to exist. TailoredResume previously pointed to a JobMatch row to
get the job's title/company/JD — those fields move inline so the tailored PDF
context survives after the ephemeral job data is gone.

Existing dev-time TailoredResume rows (if any) pointed to JobMatch rows that
are also being dropped, so they are wiped before the schema change.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("job_finder", "0003_add_search_role"),
    ]

    operations = [
        # Wipe any dev-time tailored resumes whose job_match FK is about to vanish.
        migrations.RunSQL(
            "DELETE FROM job_finder_tailoredresume;",
            reverse_sql=migrations.RunSQL.noop,
        ),

        # Add job context fields inline (replacing the FK lookup into the now-gone JobMatch).
        migrations.AddField(
            model_name="tailoredresume",
            name="job_title",
            field=models.CharField(blank=True, max_length=255, default=""),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="tailoredresume",
            name="job_company",
            field=models.CharField(blank=True, max_length=255, default=""),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="tailoredresume",
            name="job_jd_text",
            field=models.TextField(blank=True, default=""),
            preserve_default=False,
        ),

        # Drop the old FK to JobMatch before deleting the table.
        migrations.RemoveField(
            model_name="tailoredresume",
            name="job_match",
        ),

        # Add FK to Resume (nullable so the empty table doesn't reject the column).
        migrations.AddField(
            model_name="tailoredresume",
            name="resume",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="tailored",
                to="job_finder.resume",
            ),
        ),

        # Make it non-null now that the table is empty and the column exists.
        migrations.AlterField(
            model_name="tailoredresume",
            name="resume",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="tailored",
                to="job_finder.resume",
            ),
        ),

        # Drop the JobMatch table — IF EXISTS so the migration is safe to run
        # against a DB where the table was already removed manually.
        migrations.RunSQL(
            "DROP TABLE IF EXISTS job_finder_jobmatch CASCADE;",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
