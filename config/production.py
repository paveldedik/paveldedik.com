#!/usr/bin/env python
# -*- coding: utf-8 -*- #


from __future__ import unicode_literals

import os
import sys

from pelicanconf import *  # noqa


sys.path.append(os.curdir)


SITEURL = 'http://paveldedik.com'
RELATIVE_URLS = False

FEED_ALL_ATOM = 'feeds/all.atom.xml'
CATEGORY_FEED_ATOM = 'feeds/%s.atom.xml'

DELETE_OUTPUT_DIRECTORY = True

# Following items are often useful when publishing

# DISQUS_SITENAME = ""
# GOOGLE_ANALYTICS = ""
