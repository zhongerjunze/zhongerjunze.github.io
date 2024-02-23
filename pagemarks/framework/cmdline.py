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

from typing import Optional
from pagemarks.framework.globals import DEFAULT_COLL_NAME



class CmdLine(object):
    """Command line options applicable to all commands."""
    collection_name: Optional[str]
    git_commit: bool
    git_pull: bool
    git_push: bool
    overwrite_all_bookmarks: bool
    repo_dir: Optional[str]
    yes: bool


    def __init__(self):
        self.collection_name = None
        self.git_commit = True
        self.git_pull = True
        self.git_push = True
        self.overwrite_all_bookmarks = False
        self.repo_dir = None
        self.yes = False


    def get_collection_name(self) -> str:
        """Return the name of the selected collection. Will return ``default`` if none was selected. Use the
           ``collection_name`` field to see if it is ``None``."""
        return DEFAULT_COLL_NAME if self.collection_name is None else self.collection_name
