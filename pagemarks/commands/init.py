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

import atexit
import os
from logging import getLogger, Logger
from typing import Optional

import pkg_resources
from genshi.template import Context, NewTextTemplate
from git import Repo as GitRepo

from pagemarks.framework.basecmd import PagemarksCommand
from pagemarks.framework.cmdline import CmdLine
from pagemarks.framework.repo import COLL_CFG_FILENAME, Repo


LOG: Logger = getLogger(__name__)



class CmdInit(PagemarksCommand):
    """
    Initialize a new Pagemarks repository.

    A new repo contains exactly one collection, named either 'default' or something else specified by
    ``config.collection_name``.
    """
    user_name: Optional[str]
    user_email: Optional[str]


    def __init__(self, config: CmdLine, user_name: Optional[str], user_email: Optional[str]):
        super().__init__(config, git_needed=True)
        self.user_name = user_name
        self.user_email = user_email


    def invalid_args(self) -> Optional[str]:
        repo_dir = self.locate_repo()
        if not os.path.isdir(repo_dir):
            return 'Not a directory: ' + repo_dir
        if os.listdir(repo_dir):
            return 'Directory not empty: ' + repo_dir
        return None


    def locate_repo(self) -> str:
        if self.config.repo_dir is not None:
            return self.config.repo_dir
        else:
            return '.'


    def open_repo(self) -> Repo:
        repo = Repo(None)
        repo.repo_dir = self.locate_repo()
        return repo


    def provide_git_repo(self, repo: Repo) -> None:
        repo.git_repo = GitRepo.init(repo.repo_dir)
        repo.git_remote = False


    @staticmethod
    def cleanup_extracted_resources() -> None:
        LOG.debug('Cleaning up resources extracted by pkg_resources')
        pkg_resources.cleanup_resources()


    def execute(self, repo: Repo):
        atexit.register(self.cleanup_extracted_resources)

        self.configure_git_repo(repo.git_repo)
        self.create_readme_md(repo.repo_dir)
        self.create_git_attributes(repo.repo_dir)
        self.create_gitlabci_yaml(repo.repo_dir)
        self.create_initial_coll(repo)
        self.commit_initial(repo.git_repo)


    def configure_git_repo(self, repo: GitRepo):
        with repo.config_writer('repository') as cw:
            # Tell Git to automatically use system-specific line endings.
            cw.set_value('core', 'autocrlf', 'true')

            # Turn off the CRLF safety check. Since we know that we only have generated JSON files, the potential
            # corruption is impossible. Any warnings would only mislead or annoy users.
            cw.set_value('core', 'safecrlf', 'false')

            # Turn off rename detection, which would make no sense in our use case, because we compute file names from
            # the bookmark URLs. Therefore, a different file name will *always* indicate a different bookmark, so
            # rename detection could only find false positives by definition.
            cw.set_value('diff', 'renames', 'false')

            # Rebase local commits onto the pulled branch, so we have a clean git history.
            cw.set_value('pull', 'rebase', 'true')

            # Set user name and email as specified on command line.
            if self.user_name is not None and len(self.user_name) > 0:
                cw.set_value('user', 'name', self.user_name)
            if self.user_email is not None and len(self.user_email) > 0:
                cw.set_value('user', 'email', self.user_email)


    def create_readme_md(self, repo_dir: str) -> None:
        template_src = self.read_resource('../resources/repo/README.md')
        username = 'someone' if self.user_name is None or len(self.user_name.strip()) == 0 else self.user_name
        template = NewTextTemplate(template_src, encoding='utf-8')
        readme_md = template.generate(Context(username=username)).render()
        self.write_resource(repo_dir, '../README.md', readme_md)


    @staticmethod
    def create_git_attributes(repo_dir: str):
        content = '* text=auto\n*.sh text eol=lf\n*.bat text eol=crlf\n'
        with open(os.path.join(repo_dir, '.git/info/attributes'), 'w', newline='\n') as attr_file:
            attr_file.write(content)


    def create_initial_coll(self, repo: Repo) -> None:
        coll_dir = os.path.join(repo.repo_dir, self.config.get_collection_name())
        os.makedirs(coll_dir)
        coll_templ_json = self.read_resource('../resources/repo/collection-template.json')
        self.write_resource(repo.repo_dir, COLL_CFG_FILENAME, coll_templ_json)
        repo.add_collection(coll_dir)


    def create_gitlabci_yaml(self, repo_dir: str) -> None:
        gitlabci_yml = self.read_resource('../resources/repo/gitlab-ci.yml')
        self.write_resource(repo_dir, '../.gitlab-ci.yml', gitlabci_yml)


    def commit_initial(self, repo: GitRepo) -> None:
        repo.index.add('README.md')
        repo.index.add('.gitlab-ci.yml')
        repo.index.add(self.config.get_collection_name() + '/' + COLL_CFG_FILENAME)
        repo.index.commit('Initial Commit')


    @staticmethod
    def read_resource(path: str) -> str:
        return pkg_resources.resource_string(__name__, path) \
            .replace(b'\r\n', b'\n') \
            .decode('utf-8')


    def write_resource(self, repo_dir: str, path: str, content: str) -> None:
        coll_name = self.config.get_collection_name()
        with open(os.path.join(repo_dir, coll_name, path), 'w') as f:
            f.write(content)
