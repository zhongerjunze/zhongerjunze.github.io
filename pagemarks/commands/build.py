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
import re
import shutil
from logging import getLogger, Logger
from typing import Optional

import commentjson
import pkg_resources
from genshi.template import NewTextTemplate

from pagemarks.framework.basecmd import PagemarksCommand
from pagemarks.framework.cmdline import CmdLine
from pagemarks.framework.render import GenshiBookmarkContext, GenshiCollectionContext
from pagemarks.framework.repo import Bookmark, Collection, Repo


LOG: Logger = getLogger(__name__)



class CmdBuild(PagemarksCommand):
    """Generate a Pagemarks website for the repo"""
    base_url: str
    api_url: str
    output_dir: str
    demo_mode: bool
    gitlab_id: int


    def __init__(self, config: CmdLine, base_url: str, api_url: str, output_dir: str, demo_mode: bool, gitlab_id: int):
        super().__init__(config, git_needed=True)
        self.base_url = base_url
        self.api_url = api_url
        self.output_dir = output_dir
        self.demo_mode = demo_mode
        self.gitlab_id = gitlab_id


    def invalid_args(self) -> Optional[str]:
        return None


    # noinspection PyUnusedLocal
    @staticmethod
    def ignore_python(src: str, names: list[str]) -> list[str]:
        return [s for s in names if not s.endswith('.js')]


    # noinspection PyUnusedLocal
    @staticmethod
    def ignore_gitkeep(src: str, names: list[str]) -> list[str]:
        return [s for s in names if s == '.gitkeep']  # TODO return ['.gitkeep'] !?


    @staticmethod
    def cleanup_extracted_resources() -> None:
        LOG.debug('Cleaning up resources extracted by pkg_resources')
        pkg_resources.cleanup_resources()


    def execute(self, repo: Repo):
        # TODO handle self.demo argument
        extracted_css = pkg_resources.resource_filename('pagemarks.resources', 'css')
        shutil.copytree(extracted_css, self.output_dir + '/css', dirs_exist_ok=True, ignore=self.ignore_gitkeep)
        extracted_js = pkg_resources.resource_filename('pagemarks.js', '')
        shutil.copytree(extracted_js, self.output_dir + '/js', dirs_exist_ok=True, ignore=self.ignore_python)
        extracted_js_vendor = pkg_resources.resource_filename('pagemarks.js', 'vendor')
        shutil.copytree(extracted_js_vendor, self.output_dir + '/js/vendor', dirs_exist_ok=True, ignore=self.ignore_python)
        atexit.register(self.cleanup_extracted_resources)

        css_themes = self.load_theme_list()
        git_branch = self.get_git_branch(repo)
        for coll in repo.collections:
            if self.config.collection_name is not None and self.config.collection_name != coll.name:
                continue

            coll.populate()
            if coll.is_empty():
                LOG.info(f"Collection '{coll.name}' is empty. Skipping.")
                continue

            html = self.build_collection(coll, css_themes, git_branch)
            LOG.info(f"Read {len(coll.bookmarks)} bookmarks from collection \'{coll.name}\'.")
            coll_filename = os.path.join(self.output_dir, coll.get_htmlname())
            with open(coll_filename, 'w', encoding='utf-8') as coll_outfile:
                coll_outfile.write(html)
                LOG.info('Collection generated: ' + coll_filename)


    def load_theme_list(self) -> dict:
        jsonc = self.read_resource('../resources/html/css-themes.json')
        return commentjson.loads(jsonc)


    def get_git_branch(self, repo: Repo) -> Optional[str]:
        if self.demo_mode:
            return '(demo)'
        else:
            try:
                return repo.git_repo.active_branch.name
            except TypeError:
                # detached head, no branch available
                return None


    def build_collection(self, coll: Collection, css_themes: dict, git_branch: Optional[str]) -> str:
        template = self.read_resource('../resources/html/index.html')
        html_template = NewTextTemplate(template, encoding='utf-8')
        genshi_context = GenshiCollectionContext(self.base_url, self.api_url, css_themes, coll, git_branch,
                self.gitlab_id).to_context()
        index_html = html_template.generate(genshi_context).render()
        all_tags = set()

        bookmark_html = self.build_bookmarks(coll.bookmarks, all_tags)
        index_html = index_html.replace('<!-- //BOOKMARKS// -->', '\n'.join(bookmark_html))

        analytics_html = self.build_analytics(coll)
        index_html = index_html.replace('<!-- //ANALYTICS// -->', analytics_html)

        settings_apitoken_template = self.read_resource('../resources/html/settings-apitoken.html')
        settings_apitoken_html = NewTextTemplate(settings_apitoken_template, encoding='utf-8').generate().render()
        index_html = index_html.replace('<!-- //SETTINGS-APITOKEN// -->', settings_apitoken_html)

        dialog_edit_template = self.read_resource('../resources/html/edit-bookmark.html')
        dialog_edit_html = NewTextTemplate(dialog_edit_template, encoding='utf-8').generate().render()
        index_html = index_html.replace('<!-- //DIALOG-EDIT// -->', dialog_edit_html)

        tags_filename = os.path.join(self.output_dir, 'js', coll.get_tags_filename())
        with open(tags_filename, 'w', encoding='utf-8') as tags_outfile:
            tags_quoted = [f"'{t}'" for t in sorted(all_tags)]
            tags_outfile.write("import { metadata } from './metadata.js'\n\n"
                            + f"metadata.allTags = [{', '.join(tags_quoted)}];\n")
            LOG.info(f"{len(all_tags)} tags written to {tags_filename}.")
        return index_html


    def build_bookmarks(self, bookmarks: list[Bookmark], all_tags: set[str]) -> list[str]:
        template = self.read_resource('../resources/html/bookmark.html')
        html_template = NewTextTemplate(template, encoding='utf-8')
        empty_line_pattern = re.compile('^\s*$\n', re.MULTILINE)
        result: list[str] = []
        for bm in bookmarks:
            genshi_context = GenshiBookmarkContext(self.base_url, bm).to_context()
            all_tags.update([t.tag for t in genshi_context.get('tags')])
            html = html_template.generate(genshi_context).render()
            html = re.sub(empty_line_pattern, '', html)
            result.append(html)
        return result


    def build_analytics(self, coll: Collection) -> str:
        result_html = ''
        for provider in coll.analytics:
            template = self.read_resource(f"../resources/html/analytics_{provider}.html")
            html_template = NewTextTemplate(template, encoding='utf-8')
            html = html_template.generate(coll.get_analytics_ctx(provider)).render()
            result_html += '\n    ' + html.strip()
        return result_html + '\n'


    @staticmethod
    def read_resource(path: str) -> str:
        return pkg_resources.resource_string(__name__, path) \
            .replace(b'\r\n', b'\n') \
            .decode('utf-8')
