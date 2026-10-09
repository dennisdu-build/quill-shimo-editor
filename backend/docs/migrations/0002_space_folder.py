"""新增 Space/Folder，Document 挂空间和文件夹。"""
from django.db import migrations, models
import django.db.models.deletion


def create_default_space(apps, schema_editor):
    """创建默认个人空间「我的桌面」，把历史文档全部挂进去。"""
    Space = apps.get_model('docs', 'Space')
    Document = apps.get_model('docs', 'Document')
    space = Space.objects.create(id=1, name='我的桌面', kind='personal')
    Document.objects.filter(space__isnull=True).update(space=space)


def remove_default_space(apps, schema_editor):
    Space = apps.get_model('docs', 'Space')
    Space.objects.filter(id=1).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('docs', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Space',
            fields=[
                ('id', models.BigAutoField(
                    auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('kind', models.CharField(
                    choices=[('personal', '个人空间'), ('team', '团队空间')],
                    default='team', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['created_at']},
        ),
        migrations.CreateModel(
            name='Folder',
            fields=[
                ('id', models.BigAutoField(
                    auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('parent', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='children', to='docs.folder')),
                ('space', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='folders', to='docs.space')),
            ],
            options={'ordering': ['name']},
        ),
        migrations.AddField(
            model_name='document',
            name='space',
            field=models.ForeignKey(
                null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name='documents', to='docs.space'),
        ),
        migrations.AddField(
            model_name='document',
            name='folder',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='documents', to='docs.folder'),
        ),
        migrations.RunPython(create_default_space, remove_default_space),
        migrations.AlterField(
            model_name='document',
            name='space',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='documents', to='docs.space'),
        ),
    ]
