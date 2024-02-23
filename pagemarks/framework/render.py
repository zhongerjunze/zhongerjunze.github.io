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
from datetime import timezone
from html import escape
from typing import Optional
from urllib.parse import quote, unquote

from genshi.template import Context
import pkg_resources

from pagemarks.framework.repo import Bookmark, Collection



class TagData:
    tag: str
    link: str


    def __init__(self, tag: str):
        self.tag = tag
        self.link = ''



class GenshiBookmarkContext(object):
    baseurl: str
    id: str
    date_added_secs: Optional[int]
    all_tags: str
    name_searchtext: str
    is_long_name: bool
    name: Optional[str]
    truncated_name: Optional[str]
    url_uri: str
    url_html: str
    notes: Optional[str]
    tags: list[TagData]


    def __init__(self, base_url: str, bm: Bookmark, **data):
        super().__init__(**data)
        self.baseurl = base_url
        self.date_added_secs = None
        self.name = None
        self.truncated_name = None
        self.notes = None
        self.tags = []
        self.from_bookmark(bm)


    def from_bookmark(self, bm: Bookmark) -> None:
        self.id = bm.id.replace('/', '-')
        if bm.date_added is not None:
            self.date_added_secs = int(bm.date_added.replace(tzinfo=timezone.utc).timestamp())
        self.all_tags = '", "'.join(bm.tags)
        self.name_searchtext = self.build_searchtext(bm)
        self.is_long_name = bm.name is not None and len(bm.name) > 90
        if bm.name is not None:
            self.name = escape(bm.name)
        if self.is_long_name:
            self.truncated_name = escape(bm.name[:86] + ' ...')
        self.url_uri = bm.url
        self.url_html = escape(bm.url)
        if bm.notes is not None:
            self.notes = escape(bm.notes)
        self.tags = self.build_tag_data(bm.tags)


    def build_searchtext(self, bm: Bookmark) -> str:
        result = ''
        if bm.name is not None:
            result += escape(bm.name.lower())
        if len(bm.tags) > 0:
            result += ' '
        result += ' '.join(bm.tags)
        result += ' '
        result += escape(self.remove_extension(self.remove_protocol(unquote(bm.url).lower())))
        return result


    @staticmethod
    def remove_protocol(url: str) -> str:
        if url.startswith('https://'):
            return url[8:]
        elif url.startswith('http://'):
            return url[7:]
        elif url.startswith('ftp://'):
            return url[6:]
        else:
            return url


    @staticmethod
    def remove_extension(url: str) -> str:
        if url.endswith('.html'):
            return url[:-5]
        elif url.endswith('.shtml'):
            return url[:-6]
        else:
            return url


    def build_tag_data(self, tags: list[str]) -> list[TagData]:
        result: list[TagData] = []
        for tag in tags:
            tag_data = TagData(tag)
            tag_data.link = escape(self.baseurl + '/index.html?q=[' + tag + ']')  # FIXME collection name
            result.append(tag_data)
        return result


    def to_context(self) -> Context:
        return Context(
                id=self.id,
                date_added_secs=self.date_added_secs,
                name=self.name,
                truncated_name=self.truncated_name,
                notes=self.notes,
                tags=self.tags,
                all_tags=self.all_tags,
                name_searchtext=self.name_searchtext,
                is_long_name=self.is_long_name,
                url_uri=self.url_uri,
                url_html=self.url_html
        )



class FilterData(object):
    uri_escaped: str
    html_escaped: str


    def __init__(self, qfilter: str):
        self.uri_escaped = quote(qfilter)
        self.html_escaped = escape(qfilter)



class ThemeData(object):
    name: str
    other_icon: str


    def __init__(self, name: str, other_icon: str):
        self.name = name
        self.other_icon = other_icon



class GenshiCollectionContext(object):
    baseurl: str
    api_url: str
    css_themes: list[ThemeData]
    css_themes_json: str
    title: str
    pinned_filters: list[FilterData]
    pagemarks_version: str
    collection_name: str
    git_branch: str
    file_basename: str


    def __init__(self, base_url: str, api_url: str, css_themes: dict, coll: Collection, git_branch: Optional[str],
            gitlab_id: int, **data):
        super().__init__(**data)
        self.title = coll.title
        self.baseurl = base_url
        self.api_url = api_url
        self.collection_name = coll.name
        self.css_themes = []
        for name, icon in css_themes.items():
            self.css_themes.append(ThemeData(name, 'moon-fill' if icon == 'sun' else 'sun'))
        self.css_themes_json = escape(json.dumps(css_themes))
        self.pinned_filters = []
        for qf in coll.pinned_filters:
            self.pinned_filters.append(FilterData(qf))
        self.pagemarks_version = pkg_resources.require('pagemarks')[0].version
        self.git_branch = git_branch if git_branch is not None else ''
        self.gitlab_id = gitlab_id
        self.file_basename = coll.get_file_basename()


    def to_context(self) -> Context:
        return Context(
                title=self.title,
                baseurl=self.baseurl,
                api_url=self.api_url,
                collection_name=self.collection_name,
                css_themes=self.css_themes,
                css_themes_json=self.css_themes_json,
                git_branch=self.git_branch,
                pinned_filters=self.pinned_filters,
                pagemarks_version=self.pagemarks_version,
                gitlab_id=self.gitlab_id,
                file_basename=self.file_basename
        )
