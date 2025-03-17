import datetime
import os
import re
from contextlib import contextmanager
from unicodedata import normalize

from colorama import Fore
from fabric import task
from invoke import run

SLUG_REGEX = re.compile(r'[\t !"#$%&\'()*\-/<=>?@\[\\\]^_`{|},.]+')

TEMPLATE = """
Title: {0}
Date: {1:%Y-%m-%d %H:%M:%S}
Status: draft

""".lstrip()

@contextmanager
def lcd(path):
    """Context manager for changing directories."""
    old_dir = os.getcwd()
    try:
        os.chdir(path)
        yield
    finally:
        os.chdir(old_dir)

def slugify(text, delim='-', length=60):
    """Generates an ASCII-only slug."""
    result = []
    text = text if length is None else text[:length]
    for word in SLUG_REGEX.split(text.lower()):
        word = normalize('NFKD', word).encode('ascii', 'ignore').decode('ascii')
        if word:
            result.append(word)
    return delim.join(result)

@task
def clean(c):
    """Removes all generated output."""
    output_dir = os.path.join(os.getcwd(), 'output')
    if os.path.isdir(output_dir):
        run(f'rm -rf {output_dir}')
        run(f'mkdir {output_dir}')
    print(Fore.GREEN + 'All output removed.')

@task
def build(c, production=False):
    """Translates content into HTML."""
    settings = 'production' if production else 'settings'
    project_dir = os.getcwd()
    content_dir = os.path.join(project_dir, 'content')
    output_dir = os.path.join(project_dir, 'output')
    config_dir = os.path.join(project_dir, 'config')
    
    run(f'touch {content_dir}')
    run(f'pelican -s {config_dir}/{settings}.py -o {output_dir} {content_dir}')
    print(Fore.GREEN + 'All content translated.')

@task
def rebuild(c):
    """Removes output and builds content."""
    clean(c)
    build(c)

@task
def serve(c):
    """Starts up a simple HTTP server."""
    output_dir = os.path.join(os.getcwd(), 'output')
    print(Fore.YELLOW + 'Press CTRL+C to terminate the server.')
    print(Fore.GREEN + 'Server running at http://localhost:8000')
    run(f'cd {output_dir} && python -m pelican.server')

@task
def publish(c):
    """Builds the content and publishes the output on GitHub Pages."""
    output_dir = os.path.join(os.getcwd(), 'output')
    build(c, production=True)
    with lcd(output_dir):
        run(f'ghp-import -p {output_dir}')
    print(Fore.GREEN + 'Content was published.')

@task
def new(c, title):
    """Creates a new article template."""
    content_dir = os.path.join(os.getcwd(), 'content')
    slug = slugify(title)
    pubdate = datetime.datetime.now() + datetime.timedelta(hours=2)
    filename = f'{slug}.md'
    contents = TEMPLATE.format(title, pubdate)
    
    path = os.path.join(content_dir, filename)
    with open(path, 'w', encoding='utf-8') as fd:
        fd.write(contents)
    print(f'See {filename}.')