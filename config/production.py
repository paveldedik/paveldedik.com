# -*- coding: utf-8 -*- #


import os
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))

from settings import *  # noqa


# Website's URL on production

SITEURL = 'https://paveldedik.com'
RELATIVE_URLS = False


# Relative URL to output the all posts Atom feed

FEED_ALL_ATOM = 'feeds/all.atom.xml'
CATEGORY_FEED_ATOM = 'feeds/%s.atom.xml'


# Delete the content of the output directory before generating new files

DELETE_OUTPUT_DIRECTORY = True
