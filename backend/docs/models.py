from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Space(models.Model):
    """一个空间：个人空间（我的桌面）或团队空间。

    权限：个人空间归 owner 一人；团队空间通过 SpaceMember 控制谁能看到/编辑。
    """

    KIND_PERSONAL = 'personal'
    KIND_TEAM = 'team'
    KIND_CHOICES = [
        (KIND_PERSONAL, '个人空间'),
        (KIND_TEAM, '团队空间'),
    ]

    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_TEAM)
    owner = models.ForeignKey(
        User, related_name='owned_spaces', null=True, blank=True,
        on_delete=models.SET_NULL, verbose_name='空间所有者',
    )
    members = models.ManyToManyField(
        User, through='SpaceMember', related_name='member_spaces',
        blank=True, verbose_name='空间成员',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return self.name


class SpaceMember(models.Model):
    """团队空间成员及角色（owner=管理员 / editor=可编辑 / viewer=只读）。"""

    ROLE_ADMIN = 'admin'
    ROLE_EDITOR = 'editor'
    ROLE_VIEWER = 'viewer'
    ROLE_CHOICES = [
        (ROLE_ADMIN, '管理员'),
        (ROLE_EDITOR, '可编辑'),
        (ROLE_VIEWER, '只读'),
    ]
    space = models.ForeignKey(Space, related_name='member_rows', on_delete=models.CASCADE)
    user = models.ForeignKey(User, related_name='space_memberships', on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_EDITOR)

    class Meta:
        unique_together = [('space', 'user')]


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
