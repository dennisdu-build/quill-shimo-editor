"""石墨编辑器后端 —— 项目 URL 配置。"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from docs import views as docs_views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('docs.urls')),
    # 文件夹列表页：根目录（我的桌面）
    path('', docs_views.folder_page),
    # 空间页
    path('space/<int:space_id>/', docs_views.folder_page),
    # 空间内文件夹页
    path('space/<int:space_id>/folder/<int:folder_id>/', docs_views.folder_page),
    # 文档编辑页（/docs/<id>/）
    path('docs/<int:doc_id>/', docs_views.doc_page),
]

# DEBUG 下由 Django 直接服务用户上传的媒体文件；生产由 Web 服务器 / 对象存储处理
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
