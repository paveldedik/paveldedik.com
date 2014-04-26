# -*- coding: utf-8 -*-


import os

from fabric.colors import green, yellow
from fabric.api import env, local, task, lcd, execute, puts


env.project_dir = os.path.dirname(os.path.realpath(__file__))
env.content_dir = env.project_dir + '/content'
env.output_dir = env.project_dir + '/output'
env.config_dir = env.project_dir + '/config'


@task
def clean():
    """Removes all generated output."""
    if os.path.isdir(env.output_dir):
        local('rm -rf {output_dir}'.format(**env))
        local('mkdir {output_dir}'.format(**env))
    puts(green('All output removed.', bold=True))


@task
def build():
    """Translates content into HTML."""
    local('touch content')
    local('pelican -s {config_dir}/settings.py'
          ' -o {output_dir} {content_dir}'.format(**env))
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
    local('cd {output_dir} && python3 -m http.server'.format(**env))


@task
def publish():
    """Builds the content and publishes the output on GitHub Pages."""
    # build
    execute(build)

    # deploy
    with lcd(env.output_dir):
        # ghp import
        local('ghp-import -p ' + env.output_dir)

    puts(green('Content was published.', bold=True))
