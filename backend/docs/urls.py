from django.urls import path

from . import views

urlpatterns = [
    # 文档 API
    path('docs/', views.list_docs),
    path('docs/create/', views.create_doc),
    path('docs/<int:doc_id>/', views.get_doc),
    path('docs/<int:doc_id>/update/', views.update_doc),
    path('docs/<int:doc_id>/delete/', views.delete_doc),
    # 文档导出 API（html / md / txt / docx / epub）
    path('docs/<int:doc_id>/export/<str:fmt>/', views.export_doc),
    # 空间 API
    path('spaces/', views.list_spaces),
    path('spaces/create/', views.create_space),
    path('spaces/<int:space_id>/delete/', views.delete_space),
    # 文件夹 API
    path('folders/', views.list_folders),
    path('folders/create/', views.create_folder),
    path('folders/<int:folder_id>/rename/', views.rename_folder),
    path('folders/<int:folder_id>/delete/', views.delete_folder),
    # 图片上传 API
    path('upload/', views.upload_image),
    # 通用文件上传 API（图片 / 音频 / 附件）
    path('upload-file/', views.upload_file),
]
