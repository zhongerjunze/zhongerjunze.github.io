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
import re
from datetime import datetime, timezone
from functools import cmp_to_key
from typing import Optional

import pkg_resources
from genshi.template import Context
from git import Repo as GitRepo

from pagemarks.framework.globals import BOOKMARK_ID_LEN, DEFAULT_COLL_NAME
from pagemarks.framework.util import normalize_tags, PagemarksError, read_json_with_comments


COLL_CFG_FILENAME: str = 'pagemarks.json'
"""Name of the config file present in every collection"""



class Bookmark(object):
    """A bookmark as represented in a Pagemarks collection."""
    id: str
    name: Optional[str]
    url: str
    date_added: Optional[datetime]
    tags: list[str]
    notes: Optional[str]


    def __init__(self, bmid: str, url: str):
        super().__init__()
        if len(url) < 3:
            raise PagemarksError("empty url")
        self.url = url
        if len(bmid) != BOOKMARK_ID_LEN:
            raise PagemarksError("invalid bookmark id")
        self.id = bmid
        self.name = None
        self.tags = []
        self.date_added = None
        self.notes = None



class Collection(object):
    """A collection of bookmarks in a pagemarks repo."""

    name: str
    coll_dir: str
    pagemarks_json: dict
    title: str
    analytics: list[str] = []
    pinned_filters: list[str] = []
    bookmarks: list[Bookmark] = []
    bookmarks_read: bool = False


    def __init__(self, coll_dir: str) -> None:
        super().__init__()
        self.name = os.path.basename(coll_dir)
        self.coll_dir = coll_dir
        self.pagemarks_json = self.read_collection_config()


    def read_collection_config(self) -> dict:
        config_path = os.path.join(self.coll_dir, COLL_CFG_FILENAME)
        json_data = read_json_with_comments(config_path)
        if 'title' in json_data and len(json_data['title'].strip()) > 0:
            self.title = json_data['title'].strip()
        else:
            raise PagemarksError(f"Collection '{self.name}' is missing the 'title' attribute")
        if 'pinned-filters' in json_data and isinstance(json_data['pinned-filters'], list):
            for expr in json_data['pinned-filters']:
                if isinstance(expr, str):
                    self.pinned_filters.append(expr.strip())
                else:
                    raise PagemarksError('Pinned filter is not a string in ' + config_path)
        if 'analytics' in json_data and isinstance(json_data['analytics'], dict):
            self.read_analytics_config(json_data['analytics'])
        return json_data


    def read_analytics_config(self, analytics_cfg: dict) -> None:
        for provider in analytics_cfg.keys():
            if not analytics_cfg[provider]['enabled']:
                continue
            if pkg_resources.resource_exists(__name__, f"../resources/html/analytics_{provider}.html"):
                self.analytics.append(provider)
            else:
                raise PagemarksError(f"Unsupported analytics provider '{provider}' in collection '{self.name}'")


    def is_default(self) -> bool:
        return self.name == DEFAULT_COLL_NAME


    def populate(self) -> None:
        self.bookmarks = CollectionReader(self).read_bookmarks()
        self.bookmarks_read = True


    def get_file_basename(self) -> str:
        return 'index' if self.is_default() else self.name


    def get_htmlname(self) -> str:
        return self.get_file_basename() + '.html'


    def get_tags_filename(self) -> str:
        return 'tags-' + self.get_file_basename() + '.js'


    def is_empty(self) -> bool:
        if self.bookmarks_read:
            return len(self.bookmarks) < 1
        else:
            raise PagemarksError(f"Bug: Collection '{self.name}' not populated yet.")


    def get_analytics_ctx(self, provider: str) -> Context:
        provider_cfg: dict = self.pagemarks_json['analytics'][provider]
        return Context(ctx=provider_cfg)



class CollectionReader(object):
    coll: Collection


    def __init__(self, coll: Collection):
        super().__init__()
        self.coll = coll
        self.date_formats = [
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d %H:%M',
            '%Y-%m-%d',
            '%Y-%m-%d %I:%M:%S %p',
            '%Y-%m-%d %I:%M %p'
        ]


    def parse_timestamp(self, s: str) -> datetime:
        for fmt in self.date_formats:
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                pass
        raise ValueError(f"time data '{s}' does not match format '{self.date_formats[0]}'")


    def read_bookmarks(self) -> list[Bookmark]:
        result = []
        for root, dirs, files in os.walk(self.coll.coll_dir):
            for f in files:
                relative_path = os.path.join(root, f)
                if f == COLL_CFG_FILENAME:
                    continue

                with open(relative_path, 'r', encoding='utf-8') as json_file:
                    json_obj = json.load(json_file)
                bmid = f"{self.get_parent(relative_path)}/{f[:-5]}"  # cut .json extension
                bm = Bookmark(bmid, self.sanitize_url(json_obj['url'].strip()))
                if 'name' in json_obj and isinstance(json_obj['name'], str):
                    bm.name = json_obj['name'].strip()
                if 'date_added' in json_obj and isinstance(json_obj['date_added'], str):
                    bm.date_added = self.parse_timestamp(json_obj['date_added'].strip())
                if 'tags' in json_obj and isinstance(json_obj['tags'], list):
                    bm.tags = normalize_tags(json_obj['tags'])
                if 'notes' in json_obj and isinstance(json_obj['notes'], str):
                    bm.notes = json_obj['notes'].strip()
                result.append(bm)
        result.sort(key=cmp_to_key(self.compare_by_date_added_desc))
        return result


    @staticmethod
    def sanitize_url(url: str) -> str:
        most_dirty_chars = {
            '<': '%3C',
            '>': '%3E',
            '"': '%22'
        }
        result = url
        for c, enc in most_dirty_chars.items():
            result = result.replace(c, enc)
        return result


    @staticmethod
    def get_parent(p: str) -> str:
        return os.path.basename(os.path.abspath(os.path.join(p, os.pardir)))


    @staticmethod
    def compare_by_date_added_desc(a: Bookmark, b: Bookmark) -> int:
        date_a: int = int(a.date_added.replace(tzinfo=timezone.utc).timestamp()) if a.date_added is not None else 0
        date_b: int = int(b.date_added.replace(tzinfo=timezone.utc).timestamp()) if b.date_added is not None else 0
        if date_a > date_b:
            return -1
        elif date_a == date_b:
            if a.url > b.url:
                return 1
            elif a.url < b.url:
                return -1
            else:
                return 0
        else:
            return 1



class Repo(object):
    """A pagemarks git repository."""

    repo_dir: str

    collections: list[Collection]

    git_repo: Optional[GitRepo]

    git_remote: bool
    """Flag indicating if the associated git repo has a remote called 'origin'."""


    def __init__(self, repo_dir: Optional[str]) -> None:
        super().__init__()
        self.git_repo = None
        self.git_remote = False
        if repo_dir is None:
            self.repo_dir = '.'
            self.collections = []
        else:
            self.repo_dir = os.path.normpath(repo_dir)
            self.collections = self.scan_collections()


    def scan_collections(self) -> list[Collection]:
        result: list[Collection] = []
        for f in os.listdir(self.repo_dir):
            coll_dir = os.path.join(self.repo_dir, f)
            if self.is_collection(coll_dir):
                result.append(Collection(coll_dir))
        if len(result) < 1:
            raise PagemarksError('No pagemarks collections found in directory: ' + self.repo_dir)
        return result


    @staticmethod
    def is_collection(coll_path: str) -> bool:
        return re.compile('^[a-z][a-z0-9_-]+$').match(os.path.basename(coll_path)) is not None \
               and os.path.isdir(coll_path) \
               and os.path.isfile(os.path.join(coll_path, COLL_CFG_FILENAME))


    def get_name(self) -> str:
        return os.path.basename(self.repo_dir)


    def add_collection(self, coll_dir: str) -> Collection:
        for coll in self.collections:
            if coll.coll_dir == coll_dir:
                raise PagemarksError(f"Collection '{coll.name}' already exists")
        coll = Collection(coll_dir)
        self.collections.append(coll)
        return coll
