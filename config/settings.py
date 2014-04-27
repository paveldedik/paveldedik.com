# -*- coding: utf-8 -*- #


from __future__ import unicode_literals

import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))

from utils import filters


# Author's and Website's name

AUTHOR = u'Pavel Dedík'
SITENAME = u'Pavel Dedík\'s Website'
SITEURL = ''


# Default Language and Timezone

TIMEZONE = 'Europe/Prague'
DEFAULT_LANG = 'en'


# Feed generation is usually not desired when developing

FEED_ALL_ATOM = None
CATEGORY_FEED_ATOM = None
TRANSLATION_FEED_ATOM = None


# Number of posts on each page

DEFAULT_PAGINATION = 5


# Custom Theme

THEME = 'theme'
THEME_STATIC_PATHS = ('static',)


# Disqus and Other Third-Paries

DISQUS_SITENAME = 'paveldedik'


# Static paths will be copied under the same name

STATIC_PATHS = (
    'robots.txt',
    'CNAME',
)


# Custom Jinja Filters

JINJA_FILTERS = {
    'date': filters.to_date,
    'slug': filters.slugify,
    'copyright': filters.copyright,
}
