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
import re
from logging import getLogger, Logger
from typing import Optional

from bs4 import BeautifulSoup
from bs4.element import Doctype, Tag

from pagemarks.commands.add import CmdAdd, JsonTagList
from pagemarks.framework.basecmd import PagemarksCommand
from pagemarks.framework.cmdline import CmdLine
from pagemarks.framework.repo import Repo
from pagemarks.framework.util import normalize_tags, normalize_timestamp, PagemarksAbort, PagemarksError


LOG: Logger = getLogger(__name__)



class ImportStats(object):
    num_bookmarks_imported: int = 0
    num_notes_imported: int = 0
    tags_imported: set[str] = set()
    num_private_bookmarks: int = 0
    files_added: list[str] = []



class AbstractImporter(object):
    """Abstract superclass of all concrete importers."""
    __metaclass__ = abc.ABCMeta
    config: CmdLine
    include_private: bool
    repo: Repo
    input_path: str


    def __init__(self, config: CmdLine, repo: Repo, include_private: bool, input_path: str) -> None:
        super().__init__()
        self.config = config
        self.repo = repo
        self.include_private = include_private
        self.input_path = input_path


    @abc.abstractmethod
    def get_input_desc(self) -> str:
        """Return the descriptive name of the input source supported by the concrete importer."""
        raise PagemarksError('method not implemented')


    @staticmethod
    @abc.abstractmethod
    def validate_input_path(input_path: str) -> bool:
        """
        Check if the given input path appears to be the expected source.

        :returns: ``True`` if the check is successful, ``False`` otherwise
        """
        raise PagemarksError('method not implemented')


    @abc.abstractmethod
    def run_import(self) -> ImportStats:
        """
        Perform the actual import. Can raise a PagemarksError when things go south.

        :returns: a fully completed statistics object, which will also be used to commit the imported files
        """
        raise PagemarksError('method not implemented')



class NetscapeImporter(AbstractImporter):
    """Import a Netscape bookmarks file into a Pagemarks collection."""


    def get_input_desc(self) -> str:
        return 'Netscape Bookmark file'


    @staticmethod
    def validate_input_path(input_path: str) -> bool:
        """The ``input_path`` is considered a Netscape Bookmark File (NBM) if it's an HTML file."""
        return os.path.isfile(input_path) and input_path.lower().endswith('.html')


    def run_import(self) -> ImportStats:
        stats = ImportStats()
        with open(self.input_path, 'r', encoding='utf-8') as nbm_file:
            soup = BeautifulSoup(nbm_file, features='html5lib')
        self.check_nbm_doctype(soup)
        elems = soup.select('dt')
        for dt in elems:
            a = dt.a
            if a is None:
                continue
            is_private = 'private' in a.attrs and a.attrs['private'] == '1'
            if is_private:
                stats.num_private_bookmarks += 1
                if not self.include_private:
                    continue  # skip private bookmark

            record = self.html2record(dt, stats)
            if record is None:
                continue

            filename = CmdAdd(self.config, record['tags'], record['url']).add_file(self.repo, record, git=False)
            stats.files_added.append(filename)
            stats.num_bookmarks_imported += 1

        return stats


    def check_nbm_doctype(self, soup: BeautifulSoup):
        ok = False
        for item in soup.contents:
            if isinstance(item, Doctype) and item.lower().startswith('netscape-bookmark-file'):
                ok = True
                break
        if not ok:
            raise PagemarksError(f"\'{self.input_path}\' is not a Netscape Bookmark file")


    @staticmethod
    def html2record(dt: Tag, stats: ImportStats) -> Optional[dict]:
        a = dt.a
        record = {}
        if a.text is not None and len(a.text.strip()) > 0:
            record['name'] = a.text.strip()
        if 'href' in a.attrs:
            record['url'] = a.attrs['href']
        else:
            return None  # not a bookmark (could be an icon, webslice, or feed)
        if 'tags' in a.attrs:
            record['tags'] = JsonTagList(normalize_tags(re.split(',|\\s', a.attrs['tags'])))
            stats.tags_imported.update(record['tags'].tag_list)
        if 'add_date' in a.attrs:
            record['date_added'] = normalize_timestamp(a.attrs['add_date'])

        dd = dt.next_sibling
        if dd is not None and dd.name == 'dd' and dd.text is not None:
            record['notes'] = dd.text.strip()
            stats.num_notes_imported += 1
        return record



class NbImporter(AbstractImporter):
    """Import an nb repo into a Pagemarks collection."""


    def get_input_desc(self) -> str:
        return 'nb repository'


    @staticmethod
    def validate_input_path(input_path: str) -> bool:
        """The ``input_path`` is considered an nb repo if it's a directory with TODO how to recogize nb repos?"""
        return os.path.isdir(input_path)


    def run_import(self) -> ImportStats:
        # TODO implement run_import()
        raise PagemarksAbort('Importing nb repos is not yet implemented.')



class ImporterFactory(object):

    @staticmethod
    def for_input_path(config: CmdLine, repo: Repo, include_private: bool, input_path: str) -> AbstractImporter:
        if NetscapeImporter.validate_input_path(input_path):
            return NetscapeImporter(config, repo, include_private, input_path)
        elif NbImporter.validate_input_path(input_path):
            return NbImporter(config, repo, include_private, input_path)
        else:
            raise PagemarksError(f"\'{input_path}\' is neither a Netscape Bookmark file nor an nb repo. "
                                 'Import not supported.')
        pass



class CmdImport(PagemarksCommand):
    """Import bookmarks from external sources into a Pagemarks collection."""
    include_private: bool
    input_path: str


    def __init__(self, config: CmdLine, include_private: bool, input_path: str):
        super().__init__(config, git_needed=True)
        self.include_private = include_private
        self.input_path = input_path


    def invalid_args(self) -> Optional[str]:
        if self.input_path is None or len(self.input_path.strip()) == 0:
            return 'Missing argument \'INPUT_PATH\'.'
        return None


    def execute(self, repo: Repo):
        importer = ImporterFactory.for_input_path(self.config, repo, self.include_private, self.input_path)
        stats = importer.run_import()
        self.commit_imported_files(repo, stats.files_added, importer.get_input_desc())
        self.print_stats(stats)


    def commit_imported_files(self, repo: Repo, files_added: list[str], input_desc: str):
        if len(files_added) == 0:
            return
        for f in files_added:
            repo.git_repo.index.add(f)
        coll_name = self.config.get_collection_name()
        repo.git_repo.index.commit(f"Import {input_desc} (collection: {coll_name})")


    def print_stats(self, stats: ImportStats):
        LOG.info(f"{stats.num_bookmarks_imported} bookmarks imported, "
                 f"containing {stats.num_notes_imported} notes and {len(stats.tags_imported)} different tags.")
        if self.include_private:
            LOG.info(f"Of those, {stats.num_private_bookmarks} were bookmarks flagged as 'private'. "
                     f"They are now the same as the other bookmarks.")
        else:
            LOG.info(f"{stats.num_private_bookmarks} private bookmarks were skipped.")
