from django.db import models


class Space(models.Model):
    """一个空间：个人空间（我的桌面）或团队空间。"""

    KIND_PERSONAL = 'personal'
    KIND_TEAM = 'team'
    KIND_CHOICES = [
        (KIND_PERSONAL, '个人空间'),
        (KIND_TEAM, '团队空间'),
    ]

    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_TEAM)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return self.name


class Folder(models.Model):
    """空间内的文件夹，parent 为空表示空间根目录，支持多级嵌套。"""

    space = models.ForeignKey(Space, related_name='folders', on_delete=models.CASCADE)
    parent = models.ForeignKey(
        'self', related_name='children', null=True, blank=True,
        on_delete=models.CASCADE,
    )
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Document(models.Model):
    """一篇文档：标题 + 富文本内容（HTML）+ 所属空间/文件夹 + 时间戳。"""

    title = models.CharField(max_length=200, default='未命名文档')
    content_html = models.TextField(default='', blank=True)
    space = models.ForeignKey(
        Space, related_name='documents', on_delete=models.CASCADE,
    )
    folder = models.ForeignKey(
        Folder, related_name='documents', null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title
