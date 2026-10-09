import json
import os
import uuid

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import JsonResponse, HttpResponseNotFound, HttpResponseBadRequest
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Document, Space, Folder


def _fmt_dt(dt):
    return dt.strftime('%Y-%m-%d %H:%M')


def _doc_to_dict(doc):
    return {
        'id': doc.id,
        'title': doc.title,
        'content_html': doc.content_html,
        'space': doc.space_id,
        'folder': doc.folder_id,
        'created_at': _fmt_dt(doc.created_at),
        'updated_at': _fmt_dt(doc.updated_at),
    }


def _space_to_dict(space):
    return {
        'id': space.id,
        'name': space.name,
        'kind': space.kind,
        'created_at': _fmt_dt(space.created_at),
    }


def _folder_to_dict(folder):
    return {
        'id': folder.id,
        'name': folder.name,
        'space': folder.space_id,
        'parent': folder.parent_id,
        'created_at': _fmt_dt(folder.created_at),
        'updated_at': _fmt_dt(folder.updated_at),
    }


def _fmt_size(n):
    """字节数 → 石墨风格大小文案。"""
    if n < 1024:
        return '%s B' % n
    if n < 1024 * 1024:
        return ('%.2f' % (n / 1024)).rstrip('0').rstrip('.') + ' KB'
    return '%.2f MB' % (n / 1024 / 1024)


def _json_body(request):
    try:
        return json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        return {}


# ==================== 页面 ====================

def folder_page(request, space_id=None, folder_id=None):
    """文件夹列表页（石墨 folder 页复刻），根路径 / 空间 / 文件夹三级共用。"""
    ctx = {}
    if space_id is not None:
        ctx['space_id'] = space_id
    if folder_id is not None:
        ctx['folder_id'] = folder_id
    return render(request, 'editor/folder.html', ctx)


def doc_page(request, doc_id):
    """文档编辑页（/docs/<id>/）。"""
    return render(request, 'editor/index.html', {'doc_id': doc_id})


# ==================== 文档 API ====================

@require_http_methods(['GET'])
def list_docs(request):
    """GET /api/docs/ —— 文档列表，可按 space/folder 过滤。

    查询参数：
      space=<id>            只看该空间
      folder=<id|root>      只看该文件夹；root 表示空间根目录（folder 为空）
    """
    qs = Document.objects.all()
    space_id = request.GET.get('space')
    folder_raw = request.GET.get('folder')
    if space_id:
        qs = qs.filter(space_id=space_id)
    if folder_raw is not None:
        if folder_raw == 'root':
            qs = qs.filter(folder__isnull=True)
        elif folder_raw:
            qs = qs.filter(folder_id=folder_raw)
    return JsonResponse([
        {
            'id': d.id,
            'title': d.title,
            'space': d.space_id,
            'folder': d.folder_id,
            'updated_at': _fmt_dt(d.updated_at),
            'created_at': _fmt_dt(d.created_at),
            'size': _fmt_size(len(d.content_html.encode('utf-8'))),
        }
        for d in qs
    ], safe=False)


@csrf_exempt
@require_http_methods(['POST'])
def create_doc(request):
    """POST /api/docs/ —— 新建文档，body: {"title","space","folder"}。"""
    payload = _json_body(request)
    space_id = payload.get('space')
    try:
        space = Space.objects.get(pk=space_id) if space_id else Space.objects.get(kind='personal')
    except Space.DoesNotExist:
        return HttpResponseBadRequest(
            JsonResponse({'error': 'space not found'}).content,
            content_type='application/json')
    folder = None
    folder_id = payload.get('folder')
    if folder_id:
        try:
            folder = Folder.objects.get(pk=folder_id, space=space)
        except Folder.DoesNotExist:
            return HttpResponseBadRequest(
                JsonResponse({'error': 'folder not found'}).content,
                content_type='application/json')
    doc = Document.objects.create(
        title=(payload.get('title') or '未命名文档')[:200],
        space=space, folder=folder,
    )
    return JsonResponse(_doc_to_dict(doc), status=201)


@require_http_methods(['GET'])
def get_doc(request, doc_id):
    """GET /api/docs/<id>/ —— 读取单篇文档完整内容。"""
    try:
        doc = Document.objects.get(pk=doc_id)
    except Document.DoesNotExist:
        return HttpResponseNotFound(JsonResponse({'error': 'not found'}).content,
                                    content_type='application/json')
    return JsonResponse(_doc_to_dict(doc))


@csrf_exempt
@require_http_methods(['PUT', 'POST'])  # POST 供 beforeunload sendBeacon 兜底保存
def update_doc(request, doc_id):
    """PUT/POST /api/docs/<id>/update/ —— 自动保存/移动，body 可含 title/content_html/folder。"""
    try:
        doc = Document.objects.get(pk=doc_id)
    except Document.DoesNotExist:
        return HttpResponseNotFound(JsonResponse({'error': 'not found'}).content,
                                    content_type='application/json')
    payload = _json_body(request)
    if 'title' in payload:
        doc.title = (payload.get('title') or '未命名文档')[:200]
    if 'content_html' in payload:
        doc.content_html = payload.get('content_html') or ''
    if 'folder' in payload:
        folder_id = payload.get('folder')
        if folder_id in (None, '', 0):
            doc.folder = None
        else:
            try:
                doc.folder = Folder.objects.get(pk=folder_id, space=doc.space)
            except Folder.DoesNotExist:
                return HttpResponseBadRequest(
                    JsonResponse({'error': 'folder not found'}).content,
                    content_type='application/json')
    doc.save()
    return JsonResponse(_doc_to_dict(doc))


@csrf_exempt
@require_http_methods(['DELETE'])
def delete_doc(request, doc_id):
    """DELETE /api/docs/<id>/delete/ —— 删除文档。"""
    try:
        doc = Document.objects.get(pk=doc_id)
    except Document.DoesNotExist:
        return HttpResponseNotFound(JsonResponse({'error': 'not found'}).content,
                                    content_type='application/json')
    doc.delete()
    return JsonResponse({'ok': True})


# ==================== 空间 API ====================

@require_http_methods(['GET'])
def list_spaces(request):
    """GET /api/spaces/ —— 全部空间（个人空间在前）。"""
    spaces = sorted(Space.objects.all(), key=lambda s: (s.kind != 'personal', s.created_at))
    return JsonResponse([_space_to_dict(s) for s in spaces], safe=False)


@csrf_exempt
@require_http_methods(['POST'])
def create_space(request):
    """POST /api/spaces/create/ —— 新建空间（团队空间），body: {"name"}。"""
    payload = _json_body(request)
    name = (payload.get('name') or '').strip()[:100]
    if not name:
        return HttpResponseBadRequest(
            JsonResponse({'error': '名称不能为空'}).content,
            content_type='application/json')
    space = Space.objects.create(name=name, kind=Space.KIND_TEAM)
    return JsonResponse(_space_to_dict(space), status=201)


@csrf_exempt
@require_http_methods(['DELETE'])
def delete_space(request, space_id):
    """DELETE /api/spaces/<id>/delete/ —— 删除空间（个人空间不允许删）。"""
    try:
        space = Space.objects.get(pk=space_id)
    except Space.DoesNotExist:
        return HttpResponseNotFound(JsonResponse({'error': 'not found'}).content,
                                    content_type='application/json')
    if space.kind == Space.KIND_PERSONAL:
        return HttpResponseBadRequest(
            JsonResponse({'error': '个人空间不能删除'}).content,
            content_type='application/json')
    space.delete()
    return JsonResponse({'ok': True})


# ==================== 文件夹 API ====================

@require_http_methods(['GET'])
def list_folders(request):
    """GET /api/folders/?space=<id> —— 该空间下全部文件夹（扁平，前端自行建树）。"""
    space_id = request.GET.get('space')
    qs = Folder.objects.all()
    if space_id:
        qs = qs.filter(space_id=space_id)
    return JsonResponse([_folder_to_dict(f) for f in qs], safe=False)


@csrf_exempt
@require_http_methods(['POST'])
def create_folder(request):
    """POST /api/folders/create/ —— 新建文件夹，body: {"space","parent","name"}。"""
    payload = _json_body(request)
    name = (payload.get('name') or '').strip()[:100]
    if not name:
        return HttpResponseBadRequest(
            JsonResponse({'error': '名称不能为空'}).content,
            content_type='application/json')
    try:
        space = Space.objects.get(pk=payload.get('space'))
    except Space.DoesNotExist:
        return HttpResponseBadRequest(
            JsonResponse({'error': 'space not found'}).content,
            content_type='application/json')
    parent = None
    parent_id = payload.get('parent')
    if parent_id:
        try:
            parent = Folder.objects.get(pk=parent_id, space=space)
        except Folder.DoesNotExist:
            return HttpResponseBadRequest(
                JsonResponse({'error': 'parent folder not found'}).content,
                content_type='application/json')
    folder = Folder.objects.create(space=space, parent=parent, name=name)
    return JsonResponse(_folder_to_dict(folder), status=201)


@csrf_exempt
@require_http_methods(['PUT'])
def rename_folder(request, folder_id):
    """PUT /api/folders/<id>/rename/ —— 重命名文件夹，body: {"name"}。"""
    try:
        folder = Folder.objects.get(pk=folder_id)
    except Folder.DoesNotExist:
        return HttpResponseNotFound(JsonResponse({'error': 'not found'}).content,
                                    content_type='application/json')
    payload = _json_body(request)
    name = (payload.get('name') or '').strip()[:100]
    if not name:
        return HttpResponseBadRequest(
            JsonResponse({'error': '名称不能为空'}).content,
            content_type='application/json')
    folder.name = name
    folder.save()
    return JsonResponse(_folder_to_dict(folder))


@csrf_exempt
@require_http_methods(['DELETE'])
def delete_folder(request, folder_id):
    """DELETE /api/folders/<id>/delete/ —— 删除文件夹（文档移到空间根目录）。"""
    try:
        folder = Folder.objects.get(pk=folder_id)
    except Folder.DoesNotExist:
        return HttpResponseNotFound(JsonResponse({'error': 'not found'}).content,
                                    content_type='application/json')
    folder.delete()  # 文档 folder SET_NULL，保留在空间内
    return JsonResponse({'ok': True})


# ==================== 图片上传 ====================

# 允许的图片扩展名与对应 MIME（不含 SVG，避免脚本注入风险）
_ALLOWED_IMAGE_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
}
_MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB


@csrf_exempt
@require_http_methods(['POST'])
def upload_image(request):
    """POST /api/upload/ —— 上传本地图片，保存到 MEDIA_ROOT/images/，返回可访问 URL。

    multipart/form-data，字段名：file。仅接受白名单图片类型，大小上限 10MB。
    """
    f = request.FILES.get('file')
    if not f:
        return HttpResponseBadRequest(
            JsonResponse({'error': '未收到文件'}).content,
            content_type='application/json')
    if f.size > _MAX_IMAGE_SIZE:
        return HttpResponseBadRequest(
            JsonResponse({'error': '图片大小不能超过 10MB'}).content,
            content_type='application/json')

    ext = os.path.splitext(f.name or '')[1].lower()
    if ext not in _ALLOWED_IMAGE_TYPES:
        return HttpResponseBadRequest(
            JsonResponse({'error': '仅支持 PNG / JPG / GIF / WebP 图片'}).content,
            content_type='application/json')
    # Content-Type 与扩展名一致性校验（若浏览器未携带则跳过）
    ctype = (f.content_type or '').split(';')[0].strip().lower()
    if ctype and ctype != _ALLOWED_IMAGE_TYPES[ext]:
        return HttpResponseBadRequest(
            JsonResponse({'error': '文件内容类型与扩展名不符'}).content,
            content_type='application/json')

    # 用 UUID 重命名，避免路径穿越与文件名冲突
    name = '%s%s' % (uuid.uuid4().hex, ext)
    rel_path = os.path.join('images', name)
    saved = default_storage.save(rel_path, f)
    url = settings.MEDIA_URL + saved.replace('\\', '/')
    return JsonResponse({'url': url, 'name': f.name or name}, status=201)


# ==================== 通用文件上传（图片 / 音频 / 附件） ====================
_ALLOWED_FILE_TYPES = {
    # 图片
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp',
    # 音频
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.webm': 'audio/webm',
    # 附件 / 文档
    '.txt': 'text/plain', '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
}
_MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB


@csrf_exempt
@require_http_methods(['POST'])
def upload_file(request):
    """POST /api/upload-file/ —— 通用文件上传（图片/音频/附件），存 media/uploads/，返回 URL 与 kind。"""
    f = request.FILES.get('file')
    if not f:
        return HttpResponseBadRequest(
            JsonResponse({'error': '未收到文件'}).content,
            content_type='application/json')
    if f.size > _MAX_FILE_SIZE:
        return HttpResponseBadRequest(
            JsonResponse({'error': '文件大小不能超过 20MB'}).content,
            content_type='application/json')

    ext = os.path.splitext(f.name or '')[1].lower()
    if ext not in _ALLOWED_FILE_TYPES:
        return HttpResponseBadRequest(
            JsonResponse({'error': '不支持的文件类型'}).content,
            content_type='application/json')

    name = '%s%s' % (uuid.uuid4().hex, ext)
    rel_path = os.path.join('uploads', name)
    saved = default_storage.save(rel_path, f)
    url = settings.MEDIA_URL + saved.replace('\\', '/')
    mime = _ALLOWED_FILE_TYPES[ext]
    kind = 'audio' if mime.startswith('audio') else ('image' if mime.startswith('image') else 'file')
    return JsonResponse({'url': url, 'name': f.name or name, 'kind': kind}, status=201)
