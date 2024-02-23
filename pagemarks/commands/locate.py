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

import base64
import os.path
from hashlib import sha1
from logging import getLogger, Logger
from typing import Optional

from pagemarks.framework.basecmd import PagemarksCommand
from pagemarks.framework.cmdline import CmdLine
from pagemarks.framework.globals import BOOKMARK_ID_LEN_HASHPART
from pagemarks.framework.repo import Repo
from pagemarks.framework.util import normalize_url, PagemarksFailure


LOG: Logger = getLogger(__name__)



class CmdLocate(PagemarksCommand):
    """Locate the bookmark file for the given URL."""
    url: str
    must_exist: bool


    def __init__(self, config: CmdLine, url: str, must_exist: bool = True):
        super().__init__(config, git_needed=False)
        self.url = url
        self.must_exist = must_exist


    def invalid_args(self) -> Optional[str]:
        if self.url is None or len(self.url.strip()) == 0:
            return 'Missing argument \'URL\'.'
        return None


    def execute(self, repo: Repo):
        path_in_coll = self.url_to_filename()
        found = False
        for coll in repo.collections:
            if self.config.collection_name is not None and self.config.collection_name != coll.name:
                continue
            LOG.debug(f"Checking file {coll.name}/{path_in_coll} ...");
            if os.path.isfile(os.path.join(coll.coll_dir, path_in_coll)):
                found = True
                LOG.info(f"{coll.name}/{path_in_coll}")
        if self.must_exist and not found:
            raise PagemarksFailure('not found')


    def url_to_filename(self) -> str:
        normalized_url = normalize_url(self.url)
        m = sha1()
        # The URL must be transformed into a byte representation for hashing. For this, we must use a fixed encoding,
        # so that we can be sure that the same URL will always map to the same hash value, independent of the system
        # used to run Pagemarks. Therefore, we always encode as UTF-8.
        m.update(normalized_url.encode('utf-8'))
        digest = m.digest()
        hashcode = base64.b32encode(digest).decode('ascii').lower()[:BOOKMARK_ID_LEN_HASHPART]
        foldernum = digest[len(digest) - 1] % pow(2, 5)
        folderstr = str(foldernum)
        if foldernum < 10:
            folderstr = '0' + folderstr
        return folderstr + '/' + hashcode + '.json'
