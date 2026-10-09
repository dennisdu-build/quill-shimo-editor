"""文档导出转换模块 —— 把已存的 content_html 转为 HTML / Markdown / 纯文本 / DOCX / EPUB。

HTML 是富文本最通用的无损中间格式，作为各格式转换的唯一源头，避免双写。
所有函数输入为 (title, content_html)，输出 str 或 BytesIO。
图片从 MEDIA_ROOT 读取后内嵌进 DOCX/EPUB，使导出文件离线可用。
"""
import os
import re
from html import unescape
from io import BytesIO
from urllib.parse import urlparse

from django.conf import settings
from django.core.files.storage import default_storage


# ==================== 公共工具 ====================

_IMG_MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
}


def sanitize_filename(title):
    """标题 → 安全文件名（保留中文/字母数字/空格，去掉文件系统非法字符）。"""
    name = re.sub(r'[\\/:*?"<>|\r\n\t]', '_', title or '未命名文档')
    name = name.strip() or '未命名文档'
    return name[:120]


def _resolve_media_path(src):
    """把 <img src> 解析为 MEDIA_ROOT 下的可读相对路径；读不到返回 None。

    支持 /media/xxx、media/xxx、相对 images/xxx 三种写法。
    """
    if not src:
        return None
    parsed = urlparse(src)
    path = parsed.path if parsed.path else src
    # 去掉 MEDIA_URL 前缀（默认 /media/）
    media_url = settings.MEDIA_URL  # 通常 '/media/'
    if path.startswith(media_url):
        path = path[len(media_url):]
    elif path.startswith('/'):
        path = path.lstrip('/')
    path = path.lstrip('/')
    if not path:
        return None
    try:
        if default_storage.exists(path):
            return path
    except Exception:
        pass
    # 兜底：直接拼 MEDIA_ROOT
    full = os.path.join(settings.MEDIA_ROOT, path)
    if os.path.isfile(full):
        return path
    return None


def _read_media_bytes(rel_path):
    """读取 MEDIA_ROOT 下相对路径的文件字节；失败返回 None。"""
    try:
        with default_storage.open(rel_path, 'rb') as f:
            return f.read()
    except Exception:
        pass
    full = os.path.join(settings.MEDIA_ROOT, rel_path)
    try:
        with open(full, 'rb') as f:
            return f.read()
    except Exception:
        return None


def _img_mime(rel_path):
    ext = os.path.splitext(rel_path)[1].lower()
    return _IMG_MIME.get(ext, 'application/octet-stream')


# ==================== HTML ====================

def export_html(title, content_html):
    """包成完整 HTML 文档。"""
    body = content_html or ''
    return (
        '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n'
        '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        '<title>{}</title>\n</head>\n<body>\n{}\n</body>\n</html>\n'
    ).format(_esc(title), body)


def _esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# ==================== Markdown ====================

def export_markdown(content_html):
    """HTML → Markdown（ATX 标题风格）。"""
    from markdownify import markdownify as md
    return md(content_html or '', heading_style='ATX', strip=['script', 'style'])


# ==================== 纯文本 ====================

def export_text(content_html):
    """HTML → 纯文本：block 元素后补换行，去标签，反转义。"""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(content_html or '', 'html.parser')
    for tag in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'blockquote', 'pre', 'div']):
        tag.append('\n')
    text = soup.get_text(separator='')
    text = unescape(text)
    # 压缩连续空行（>2 → 2）
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip() + '\n'


# ==================== DOCX ====================

def export_docx(title, content_html):
    """HTML → Word .docx（python-docx + bs4，图片从 MEDIA_ROOT 内嵌）。"""
    from bs4 import BeautifulSoup, NavigableString
    from docx import Document
    from docx.shared import Pt, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()
    doc.core_properties.title = title or '未命名文档'
    soup = BeautifulSoup(content_html or '', 'html.parser')

    def _add_runs(paragraph, node):
        """递归把 inline 子节点的格式映射到 run。"""
        for child in node.children:
            if isinstance(child, NavigableString):
                text = str(child)
                if text:
                    paragraph.add_run(text)
            elif getattr(child, 'name', None):
                name = child.name.lower()
                if name in ('strong', 'b'):
                    r = paragraph.add_run(child.get_text())
                    r.bold = True
                elif name in ('em', 'i'):
                    r = paragraph.add_run(child.get_text())
                    r.italic = True
                elif name == 'u':
                    r = paragraph.add_run(child.get_text())
                    r.underline = True
                elif name in ('s', 'del', 'strike'):
                    r = paragraph.add_run(child.get_text())
                    r.font.strike = True
                elif name == 'code':
                    r = paragraph.add_run(child.get_text())
                    r.font.name = 'Courier New'
                elif name == 'a':
                    href = child.get('href') or child.get('href') or ''
                    text = child.get_text()
                    r = paragraph.add_run(text)
                    if href:
                        r.font.underline = True
                        r.font.color.rgb = None
                    # 超链接在 python-docx 需手写 rel，这里以蓝色下划线近似
                    if href and text:
                        try:
                            r.font.color.rgb = __import__('docx.shared', fromlist=['RGBColor']).RGBColor(0x05, 0x63, 0xC1)
                        except Exception:
                            pass
                elif name == 'br':
                    paragraph.add_run().add_break()
                elif name == 'img':
                    _add_image_inline(paragraph, child)
                else:
                    _add_runs(paragraph, child)  # 嵌套 span 等

    def _add_image_inline(paragraph, img_tag):
        src = img_tag.get('src') or ''
        rel = _resolve_media_path(src)
        if rel:
            data = _read_media_bytes(rel)
            if data:
                bio = BytesIO(data)
                try:
                    run = paragraph.add_run()
                    run.add_picture(bio, width=Inches(5.0))
                    return
                except Exception:
                    pass
        alt = img_tag.get('alt') or '[图片]'
        paragraph.add_run(alt)

    def _add_table(table_tag):
        rows = table_tag.find_all('tr', recursive=False) or table_tag.select('tr')
        if not rows:
            return
        # 取最大列数
        cols = max((len(r.find_all(['td', 'th'])) for r in rows), default=0)
        if cols == 0:
            return
        tbl = doc.add_table(rows=len(rows), cols=cols)
        tbl.style = 'Table Grid'
        for ri, tr in enumerate(rows):
            cells = tr.find_all(['td', 'th'])
            for ci in range(cols):
                cell = tbl.cell(ri, ci)
                cell.text = cells[ci].get_text(strip=True) if ci < len(cells) else ''
                if ci < len(cells) and cells[ci].name == 'th':
                    for p in cell.paragraphs:
                        for r in p.runs:
                            r.bold = True

    for el in soup.children:
        if isinstance(el, NavigableString):
            text = str(el).strip()
            if text:
                doc.add_paragraph(text)
            continue
        name = el.name.lower() if el.name else ''
        if name in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            doc.add_heading(el.get_text(strip=True), level=int(name[1]))
        elif name == 'p':
            p = doc.add_paragraph()
            _add_runs(p, el)
        elif name in ('ul', 'ol'):
            style = 'List Bullet' if name == 'ul' else 'List Number'
            for li in el.find_all('li', recursive=False):
                p = doc.add_paragraph(style=style)
                _add_runs(p, li)
        elif name == 'blockquote':
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.5)
            _add_runs(p, el)
        elif name == 'pre':
            p = doc.add_paragraph()
            for r in p.add_run(el.get_text()):
                r.font.name = 'Courier New'
                r.font.size = Pt(10)
        elif name == 'table':
            _add_table(el)
        elif name == 'hr':
            doc.add_page_break()
        elif name == 'img':
            p = doc.add_paragraph()
            _add_image_inline(p, el)
        elif name in ('div', 'section', 'article'):
            # 块容器：递归处理其子块
            for sub in el.children:
                if not isinstance(sub, NavigableString) and sub.name:
                    # 简单起见，把 div 内的块走一遍顶层逻辑
                    pass
            p = doc.add_paragraph()
            _add_runs(p, el)
        else:
            text = el.get_text(strip=True)
            if text:
                doc.add_paragraph(text)

    bio = BytesIO()
    doc.save(bio)
    bio.seek(0)
    return bio


# ==================== EPUB ====================

def export_epub(title, content_html):
    """HTML → EPUB（ebooklib + bs4，图片全部内嵌为资源）。"""
    from bs4 import BeautifulSoup
    from ebooklib import epub

    book = epub.EpubBook()
    book.set_identifier('doc-export-%s' % id(title))  # 唯一标识
    book.set_title(title or '未命名文档')
    book.set_language('zh-CN')
    book.add_metadata('DC', 'creator', 'Quill Editor')

    soup = BeautifulSoup(content_html or '', 'html.parser')

    # 内嵌所有图片
    img_idx = 0
    for img in soup.find_all('img'):
        src = img.get('src') or ''
        rel = _resolve_media_path(src)
        if not rel:
            continue
        data = _read_media_bytes(rel)
        if not data:
            continue
        ext = os.path.splitext(rel)[1].lower()
        basename = 'img-%d%s' % (img_idx, ext or '.png')
        img_idx += 1
        epub_img = epub.EpubImage(
            file_name='images/' + basename,
            media_type=_img_mime(rel),
            content=data,
        )
        book.add_item(epub_img)
        img['src'] = 'images/' + basename

    body_html = str(soup)
    chapter = epub.EpubHtml(title=title or '正文', file_name='content.xhtml', lang='zh-CN')
    _epub_css = (
        'body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.8;padding:8px;}'
        'h1,h2,h3,h4,h5,h6{margin:1.2em 0 .4em;}'
        'table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ccc;padding:6px 10px;}'
        'blockquote{margin:1em 0;padding-left:1em;color:#555;border-left:3px solid #ddd;}'
        'pre{background:#f6f6f6;padding:12px;border-radius:4px;overflow:auto;}'
        'code{font-family:Menlo,Consolas,monospace;}'
        'img{max-width:100%;height:auto;}'
    )
    chapter.content = (
        '<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">'
        '<head><meta charset="utf-8"/><style>' + _epub_css + '</style></head>'
        '<body>' + body_html + '</body></html>'
    )
    book.add_item(chapter)

    # 目录 + spine
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ['nav', chapter]

    bio = BytesIO()
    epub.write_epub(bio, book, {})
    bio.seek(0)
    return bio
