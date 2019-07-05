# -*- coding: utf-8 -*- #


import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))

from utils import filters


# Author's and Website's name

AUTHOR = u'Pavel Dedík'
SITENAME = u'Pavel Dedík'
SITEURL = 'http://localhost:8000'


# Default Language and Timezone

TIMEZONE = 'Europe/Prague'
DEFAULT_LANG = 'en'
LOCALE = "en_US.UTF-8"


# Feed generation is usually not desired when developing

FEED_ALL_ATOM = None
CATEGORY_FEED_ATOM = None
TRANSLATION_FEED_ATOM = None


# Number of posts on each page and summary length

DEFAULT_PAGINATION = 5
SUMMARY_MAX_LENGTH = 100


# Custom Theme

THEME = 'theme'
THEME_STATIC_PATHS = ('static',)


# URLs

ARTICLE_URL = 'articles/{slug}'
ARTICLE_SAVE_AS = 'articles/{slug}.html'
PAGE_URL = 'articles/{slug}'
PAGE_SAVE_AS = 'articles/{slug}.html'
INDEX_SAVE_AS = 'articles/index.html'


# Disqus and Other Third-Paries

DISQUS_SITENAME = 'paveldedik'


# Static paths will be copied under the same name

STATIC_PATHS = (
    'favicon.ico',
    'robots.txt',
    'keybase.txt',
    'CNAME',
    'img',
)


# Custom Jinja Filters

JINJA_FILTERS = {
    'date': filters.to_date,
    'slug': filters.slugify,
    'copyright': filters.copyright,
    'domain': filters.url_to_domain,
}


# Extensions

PLUGIN_PATHS = [
    '../plugins/',
]

PLUGINS = [
    'render_math',
]

MD_EXTENSIONS = [
    'codehilite(css_class=highlight)',
    'toc(permalink=#)',
]

MATH_JAX = {
    'show_menu': False,
    'message_style': None,
}
