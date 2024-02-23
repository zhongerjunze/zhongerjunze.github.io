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

import json
import os
from datetime import datetime, timezone
from json import JSONEncoder
from logging import getLogger, Logger
from typing import Optional, Tuple

from bs4 import BeautifulSoup
from git import Repo as GitRepo
from requests import request

from pagemarks.commands.locate import CmdLocate
from pagemarks.framework.basecmd import PagemarksCommand
from pagemarks.framework.cmdline import CmdLine
from pagemarks.framework.repo import Repo
from pagemarks.framework.util import normalize_date, normalize_tags, PagemarksAbort, PagemarksError, prompt, \
    PromptAnswer


LOG: Logger = getLogger(__name__)



class JsonTagList:
    tag_list = None


    def __init__(self, tl):
        self.tag_list = tl



class JsonTagListEncoder(JSONEncoder):

    def default(self, obj):
        if isinstance(obj, JsonTagList):
            return "##<{}>##".format(obj.tag_list).replace('\'', '"')



class CmdAdd(PagemarksCommand):
    """Add a bookmark to a collection."""
    tags: list[str]
    url: str


    def __init__(self, config: CmdLine, tags: list[str], url: str):
        super().__init__(config, git_needed=True)
        self.tags = tags
        self.url = url


    def invalid_args(self) -> Optional[str]:
        return None


    def execute(self, repo: Repo):
        name, notes = self.parse_page()
        normalized_tags = normalize_tags(self.tags)
        record = {}
        if name is not None:
            record['name'] = name
        record['url'] = self.url
        if len(normalized_tags) > 0:
            record['tags'] = JsonTagList(normalized_tags)
        record['date_added'] = normalize_date(datetime.now(timezone.utc))
        if notes is not None:
            record['notes'] = notes
        self.log_bookmark_data(record)
        self.add_file(repo, record, git=True)


    @staticmethod
    def log_bookmark_data(record: dict) -> None:
        if 'name' in record:
            LOG.debug(f"Bookmark Name: {record['name']}")
        LOG.debug(f"Bookmark URL: {record['url']}")
        if 'tags' in record:
            LOG.debug(f"Bookmark Tags: {', '.join(record['tags'].tag_list)}")
        LOG.debug(f"Bookmark Date: {record['date_added']}")
        if 'notes' in record:
            LOG.debug(f"Bookmark Notes: {record['notes']}")


    @staticmethod
    def clean_nones(record: dict) -> dict:
        """Remove the None values from the given dictionary."""
        return {
            key: val
            for key, val in record.items()
            if val is not None
        }


    def to_json(self, record: dict) -> str:
        doc = json.dumps(self.clean_nones(record), indent=4, cls=JsonTagListEncoder, ensure_ascii=False)
        doc = doc.replace('"##<', '').replace('>##"', '')
        lines = doc.split('\n')
        doc = ''
        for line in lines:
            if line.strip().startswith('"tags":'):
                doc += line.replace('\\"', '"') + '\n'
            else:
                doc += line + '\n'
        return doc


    def parse_page(self) -> Tuple[Optional[str], Optional[str]]:
        html = self.fetch_page()
        if html is None:
            return None, None
        soup = BeautifulSoup(html, features='html5lib')
        elem = soup.select_one("head > title")
        name = elem.text.strip() if elem is not None else None

        notes = None
        elem = soup.select('head > meta[name]')
        for t in elem:
            if (str(t['name']).lower() == 'description') and ('content' in t.attrs):
                notes = t['content']
                break
        return name, notes


    def fetch_page(self) -> Optional[str]:
        try:
            response = request("GET", self.url)
            if response.status_code == 200:
                return response.text
            else:
                LOG.error(f"Failed to access URL: {self.url} (Error {response.status_code} - {response.reason})")
        except IOError as e:
            LOG.error(f"Failed to access URL: {self.url} (IOError: {e})")

        answer = prompt(self.config, 'Still create the bookmark?', offer_all=False, offer_quit=False)
        if answer == PromptAnswer.YES:
            return None
        elif answer == PromptAnswer.NO:
            raise PagemarksAbort()
        else:
            raise PagemarksError('Bug: missed branch')


    def add_file(self, repo: Repo, record: dict, git: bool) -> str:
        coll_name = self.config.get_collection_name()
        rel_path = os.path.join(coll_name, CmdLocate(self.config, self.url, False).url_to_filename())
        filename = os.path.join(repo.repo_dir, rel_path)
        LOG.debug(f"Bookmark File Name: {filename}")
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        if self.skip_existing_file(filename, record['url']):
            return rel_path

        doc = self.to_json(record)
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(doc)

        if git and self.config.git_commit:
            self.commit_file(repo.git_repo, coll_name, rel_path, record['url'])
        return rel_path


    @staticmethod
    def commit_file(git_repo: GitRepo, coll_name: str, rel_path: str, url: str) -> None:
        max_url_len = 72 - len(f"Add  (collection: {coll_name})")
        msg_url = url[:max_url_len - 1] + '…' if len(url) > max_url_len else url
        git_repo.git.execute(['git', 'add', rel_path])
        commit_msg = f"Add {msg_url} (collection: {coll_name})"
        git_repo.git.execute(['git', 'commit', '-m', commit_msg])


    def skip_existing_file(self, filename: str, url: str) -> bool:
        if os.path.isfile(filename):
            if self.config.yes or self.config.overwrite_all_bookmarks:
                return False
            LOG.info('Bookmark exists: ' + url)
            answer = prompt(self.config, 'Overwrite?')
            if answer == PromptAnswer.YES:
                return False
            elif answer == PromptAnswer.NO:
                LOG.info('Skipping.')
                return True
            elif answer == PromptAnswer.ALL:
                self.config.overwrite_all_bookmarks = True
                return False
            elif answer == PromptAnswer.QUIT:
                # TODO git reset --hard HEAD, possibly after another prompt, or check clean at start
                raise PagemarksAbort()
            else:
                raise PagemarksError('Bug: missed branch')
        return False
