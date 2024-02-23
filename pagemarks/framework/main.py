#
# pagemarks - Free, git-backed, self-hosted bookmarks
# Copyright (c) 2019-2021 the pagemarks contributors
#
# This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
# License, version 3, as published by the Free Software Foundation.
#
# This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
# warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License along with this program.
# If not, see <https://www.gnu.org/licenses/gpl.html>.
#

import logging
import sys

import click
import pkg_resources

from pagemarks.commands.add import CmdAdd
from pagemarks.commands.build import CmdBuild
from pagemarks.commands.importer import CmdImport
from pagemarks.commands.init import CmdInit
from pagemarks.commands.locate import CmdLocate
from pagemarks.framework.cmdline import CmdLine


# import sys
# for path in sys.path:
#     print(path)

pass_config = click.make_pass_decorator(CmdLine, ensure=True)



class PagemarksLogFormatter(logging.Formatter):
    dbg_fmt = "DEBUG:%(module)s:%(lineno)d: %(msg)s"
    info_fmt = '%(msg)s'


    def __init__(self):
        super().__init__(fmt="%(levelname)s: %(msg)s", datefmt=None, style='%')


    def format(self, record):
        if record.levelno == logging.DEBUG or record.levelno == logging.INFO:
            # noinspection PyProtectedMember
            format_orig = self._style._fmt

            if record.levelno == logging.DEBUG:
                self._style._fmt = self.dbg_fmt
            elif record.levelno == logging.INFO:
                self._style._fmt = self.info_fmt

            result = logging.Formatter.format(self, record)
            self._style._fmt = format_orig
        else:
            result = logging.Formatter.format(self, record)
        return result



def init_logging(quiet: bool, verbose: bool) -> None:
    handler_err = logging.StreamHandler(sys.stderr)
    handler_err.setLevel(logging.ERROR)
    handler_err.setFormatter(PagemarksLogFormatter())

    handler_out = logging.StreamHandler(sys.stdout)
    handler_out.setLevel(logging.DEBUG)
    handler_out.addFilter(lambda record: record.levelno < logging.ERROR)
    handler_out.setFormatter(PagemarksLogFormatter())

    log_level = logging.INFO
    if verbose:
        log_level = logging.DEBUG
    elif quiet:
        log_level = logging.ERROR
    logging.basicConfig(handlers=[handler_out, handler_err], level=log_level)



@click.group()
@click.option('--repo', type=click.Path(), required=False, help='Path to pagemarks repository')
@click.option('--collection', '-c', type=click.STRING, default=None, required=False,
        help='The name of the collection to operate on. Defaults to \'default\' or all, depending on the command')
@click.option('--no-commit', is_flag=True, help='Do not commit changed files to the repo')
@click.option('--no-pull', is_flag=True, help='Do not pull changes from the remote repo')
@click.option('--no-push', is_flag=True, help='Do not push new commits to the remote repo')
@click.option('--quiet', '-q', is_flag=True, help='Suppress all output except errors and command results')
@click.option('--verbose', is_flag=True, help='Enable debug output')
@click.option('--yes', '-y', is_flag=True, help='Answer all prompts with \'yes\'')
@click.version_option(pkg_resources.require('pagemarks')[0].version, prog_name='pagemarks',
        message='%(prog)s v%(version)s')
@pass_config
def app(config: CmdLine, repo, collection: str, no_commit: bool, no_pull: bool, no_push: bool, quiet: bool,
        verbose: bool, yes: bool) -> None:
    """pagemarks.org: Free, git-backed, self-hosted bookmarks"""
    config.repo_dir = repo
    config.collection_name = collection
    config.git_commit = not no_commit
    config.git_pull = not no_pull
    config.git_push = not no_push
    config.yes = yes
    init_logging(quiet, verbose)



@app.command('build')
@click.option('--base-url', required=False, default='', help='leading path fragment in internal URLs')
@click.option('--api-url', required=False, default='https://gitlab.com/api/v4', help='The GitLab URL of the REST API')
@click.option('--output-dir', '-o', required=False, default='build/site', help='generated site output directory')
@click.option('--demo', required=False, is_flag=True, help='Create site in demo mode to disable server interaction')
@click.option('--gitlab-id', required=False, default=0, type=click.types.INT,
        help='ID of the GitLab project which hosts the Pagemarks repo, required to enable server interaction')
@pass_config
def cmd_build(config: CmdLine, base_url: str, api_url: str, output_dir: str, demo: bool, gitlab_id: int) -> None:
    """Build a pagemarks website with all your bookmarks"""
    rc = CmdBuild(config, base_url, api_url, output_dir, demo, gitlab_id).run_command()
    if rc != 0:
        sys.exit(rc)



@app.command('import')
@click.option('--no-private', required=False, is_flag=True, help='Exclude bookmarks flagged as \'private\'')
@click.argument('input_path', required=True)
@pass_config
def cmd_import(config: CmdLine, no_private: bool, input_path: str) -> None:
    """Import from an nb repository or from a Netscape bookmarks file"""
    rc = CmdImport(config, not no_private, input_path).run_command()
    if rc != 0:
        sys.exit(rc)



@app.command('add')
@click.option('--encrypt', '-e', required=False, is_flag=True, help='Encrypt bookmark')
@click.option('--tag', '-t', required=False, multiple=True, default=[],
        help='Tags for the new bookmark, specify multiple times for more tags')
@click.argument('url', required=True)
@pass_config
def cmd_add(config: CmdLine, encrypt: bool, tag: list[str], url: str) -> None:
    """Add a bookmark to the repository"""
    rc = CmdAdd(config, tag, url).run_command()
    if rc != 0:
        sys.exit(rc)



@app.command('init')
@click.option('--user-name', required=False, type=click.STRING, default=None,
        help='User name to set in Git local config for the new repo')
@click.option('--user-email', required=False, type=click.STRING, default=None,
        help='User email to set in Git local config for the new repo')
@pass_config
def cmd_init(config: CmdLine, user_name, user_email) -> None:
    """Initialize a new pagemarks repository with a default collection"""
    rc = CmdInit(config, user_name, user_email).run_command()
    if rc != 0:
        sys.exit(rc)



@app.command('locate')
@click.argument('url', required=True)
@pass_config
def cmd_locate(config: CmdLine, url: str) -> None:
    """Locate the bookmark file for the given URL"""
    rc = CmdLocate(config, url).run_command()
    if rc != 0:
        sys.exit(rc)
