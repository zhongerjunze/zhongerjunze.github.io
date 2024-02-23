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

import abc
import os
from logging import getLogger, Logger
from typing import final, Optional

from git import Repo as GitRepo

from pagemarks.framework.cmdline import CmdLine
from pagemarks.framework.repo import Repo
from pagemarks.framework.util import PagemarksAbort, PagemarksError, PagemarksFailure


LOG: Logger = getLogger(__name__)



class PagemarksCommand(object):
    """Abstract superclass of all Pagemarks commands"""
    __metaclass__ = abc.ABCMeta
    config: CmdLine

    git_needed: bool  # Will the command use Git? If ``True``, a GitRepo object will be made available to it.


    def __init__(self, config: CmdLine, git_needed: bool):
        self.config = config
        self.git_needed = git_needed


    @final
    def run_command(self) -> int:
        try:
            err_msg = self.invalid_args()
            if err_msg is not None:
                LOG.error(err_msg)
                return 2
            repo = self.open_repo()
            self.validate_collspec(repo)
            self.provide_git_repo(repo)
            self.pull_changes(repo)
            self.execute(repo)
            return 0
        except PagemarksError as e:
            LOG.error(e.error_message)
            return 1
        except PagemarksFailure as e:
            LOG.info(e.error_message)
            return 1
        except PagemarksAbort as e:
            if e.message is not None:
                LOG.info(e.message)
                return 0


    def open_repo(self) -> Repo:
        repo_dir = self.locate_repo()
        if not os.path.isdir(repo_dir):
            raise PagemarksError('Repository not found: ' + repo_dir)
        return Repo(repo_dir)


    def locate_repo(self) -> str:
        if self.config.repo_dir is not None:
            return self.config.repo_dir
        else:
            return os.getenv('PAGEMARKS_REPO', '.')


    def validate_collspec(self, repo: Repo) -> None:
        if self.config.collection_name is None:
            return  # good
        for coll in repo.collections:
            if self.config.collection_name == coll.name:
                return  # good
        raise PagemarksError(
                f"Collection '{self.config.collection_name}' does not exist in repository: {repo.repo_dir}")


    def provide_git_repo(self, repo: Repo) -> None:
        if self.git_needed or self.config.git_pull:
            repo.git_repo = GitRepo(repo.repo_dir)
            assert not repo.git_repo.bare
            try:
                repo.git_remote = repo.git_repo.remote('origin') is not None
            except ValueError:
                repo.git_remote = False


    def pull_changes(self, repo: Repo) -> None:
        if self.config.git_pull and repo.git_remote:
            repo.git_repo.remote('origin').pull()


    @abc.abstractmethod
    def execute(self, repo: Repo):
        """Execute the command"""
        raise NotImplementedError('execute')


    @abc.abstractmethod
    def invalid_args(self) -> Optional[str]:
        """Validate the arguments passed into the command. An error found is immediately returned.

        :returns: the error message, in case something was wrong, or ``None`` if all is well
        """
        raise NotImplementedError('invalid_args')
