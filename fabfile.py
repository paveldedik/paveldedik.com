# -*- coding: utf-8 -*-


import os

from fabric.colors import green
from fabric.api import env, local, task, lcd, execute, puts


env.project_dir = os.path.dirname(os.path.realpath(__file__))
env.content_dir = env.project_dir + '/content'
env.output_dir = env.project_dir + '/output'
env.config_dir = env.project_dir + '/config'


def clean():
    if os.path.isdir(env.output_dir):
        local('rm -rf {output_dir}'.format(**env))
        local('mkdir {output_dir}'.format(**env))


def build():
    local('touch content')
    local('pelican -s {config_dir}/settings.py'
          ' -o {output_dir} {content_dir}'.format(**env))


def rebuild():
    clean()
    build()


def regenerate():
    local('pelican -r -s {config_dir}/settings.py'
          ' -o {output_dir} {content_dir}'.format(**env))


def serve():
    local('cd {output_dir} && python3 -m http.server'.format(**env))


def reserve():
    build()
    serve()


def preview():
    local('pelican -s {config_dir}/production.py'
          ' -o {output_dir} {content_dir}'.format(**env))


@task
def publish():
    # build
    execute(build)

    # deploy
    with lcd(env.output_dir):
        # ghp import
        local('ghp-import -p ' + env.output_dir)

    puts(green('Content was published.'))
