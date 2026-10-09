"""
Django settings —— 石墨风格编辑器后端。

关键配置均支持通过环境变量覆盖（12-Factor），不设环境变量时使用便于本地开发的默认值：

  DJANGO_SECRET_KEY    密钥（生产必须设置为随机长字符串）
  DJANGO_DEBUG         是否开启调试，默认 True；生产设为 0/false
  DJANGO_ALLOWED_HOSTS 允许的域名，逗号分隔；默认 *
  DJANGO_DATABASE_URL  预留：当前默认 SQLite（见 DATABASES）

生产部署示例：
  export DJANGO_SECRET_KEY=$(python -c "import secrets;print(secrets.token_urlsafe(50))")
  export DJANGO_DEBUG=false
  export DJANGO_ALLOWED_HOSTS=editor.example.com
"""
import os
from pathlib import Path


def _env_bool(name, default):
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in ('1', 'true', 'yes', 'on')


BASE_DIR = Path(__file__).resolve().parent.parent

# 开发默认值仅供本地使用；生产环境务必通过环境变量注入独立密钥
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-dev-only-key-do-not-use-in-production-0123456789abcdef',
)

DEBUG = _env_bool('DJANGO_DEBUG', True)

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('DJANGO_ALLOWED_HOSTS', '*').split(',') if h.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'docs',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'shimo_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'shimo_backend.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'zh-hans'
TIME_ZONE = 'Asia/Shanghai'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
# 生产部署：manage.py collectstatic 的输出目录（DEBUG 下由 runserver 直接服务静态文件）
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# 用户上传媒体（图片）：本地文件系统，正式环境可换对象存储
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
