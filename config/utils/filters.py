# -*- coding: utf-8 -*-


import re
from datetime import date
from unicodedata import normalize
from urlparse import urlparse


_slug_regex = re.compile(r'[\t !"#$%&\'()*\-/<=>?@\[\\\]^_`{|},.]+')


def copyright(year):
    """Template filter that prints copyright.
    """
    current_year = date.today().year
    if current_year == year:
        period = str(year)
    else:
        period = '{0}&ndash;{1}'.format(year, current_year)
    return u'&copy; {}'.format(period)


def to_date(datum, dformat='%d. %m. %Y'):
    """Template filter that prints given date.
    """
    return datum.strftime(dformat)


def slugify(text, delim=u'-', length=None):
    """Generates an ASCII-only slug. A slug is the part of a URL which
    identifies a page using human-readable keywords.
    See `Generating Slugs<http://flask.pocoo.org/snippets/5/>`_.
    """
    result = []
    text = text if length is None else text[:length]
    for word in _slug_regex.split(text.lower()):
        word = normalize('NFKD', word).encode('ascii', 'ignore')
        if word:
            result.append(word)
    return unicode(delim.join(result))


def url_to_domain(uri):
    """Extracts domain from given URI.
    """
    return urlparse(uri).netloc