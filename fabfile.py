# -*- coding: utf-8 -*-


import os
import re
import datetime
from unicodedata import normalize

from fabric.colors import green, yellow
from fabric.api import env, local, task, lcd, execute, puts


env.project_dir = os.path.dirname(os.path.realpath(__file__))
env.content_dir = env.project_dir + '/content'
env.output_dir = env.project_dir + '/output'
env.config_dir = env.project_dir + '/config'

SLUG_REGEX = re.compile(r'[\t !"#$%&\'()*\-/<=>?@\[\\\]^_`{|},.]+')

TEMPLATE = """
Title: {0}
Date: {1:%Y-%m-%d %H:%M:%S}

""".lstrip()


def slugify(text, delim=u'-', length=60):
    """Generates an ASCII-only slug. A slug is the part of a URL which
    identifies a page using human-readable keywords.
    See `Generating Slugs<http://flask.pocoo.org/snippets/5/>`_.
    :type text: unicode
    :param delim: Separator for white space characters. Default is hyphen.
    :type delim: unicode
    :param length: Maximum lenght of the result. Default is `60`.
    :type length: integer
    :rtype: unicode
    """
    result = []
    text = text if length is None else text[:length]
    for word in SLUG_REGEX.split(text.lower()):
        word = normalize('NFKD', word).encode('ascii', 'ignore')
        if word:
            result.append(word)
    return unicode(delim.join(result))


@task
def clean():
    """Removes all generated output."""
    if os.path.isdir(env.output_dir):
        local('rm -rf {output_dir}'.format(**env))
        local('mkdir {output_dir}'.format(**env))
    puts(green('All output removed.', bold=True))


@task
def build(production=False):
    """Translates content into HTML."""
    settings = 'production' if production else 'settings'
    local('touch content')
    local('pelican -s {config_dir}/{settings}.py'
          ' -o {output_dir} {content_dir}'.format(settings=settings, **env))
    puts(green('All content translated.', bold=True))


@task
def rebuild():
    """Removes output and builds content."""
    execute(clean)
    execute(build)


@task
def serve():
    """Starts up simple HTTP server."""
    puts(yellow('Press CTRL+C to terminate the server.', bold=True))
    local('cd {output_dir} && pelican server'.format(**env))


@task
def publish():
    """Builds the content and publishes the output on GitHub Pages."""
    # build
    execute(build, production=True)

    # deploy
    with lcd(env.output_dir):
        # ghp import
        local('ghp-import -p ' + env.output_dir)

    puts(green('Content was published.', bold=True))


@task
def new(title):
    """Creates new article template"""
    slug = slugify(unicode(title.encode('utf8')))
    pubdate = datetime.datetime.now() + datetime.timedelta(hours=2)

    filename = '{}.md'.format(slug)
    contents = TEMPLATE.format(title, pubdate)

    path = os.path.join(env.content_dir, filename)
    with open(path, 'w') as fd:
        fd.write(contents.encode('utf8'))
        puts('See {0}.'.format(filename))
