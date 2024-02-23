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

import re
from datetime import datetime
from enum import Enum
from typing import Optional

import commentjson
from slugify import slugify

from pagemarks.framework.cmdline import CmdLine


DATE_FORMAT: str = '%Y-%m-%d %H:%M:%S'
"""The format of dates/timestamps in a Pagemarks repo"""



class PagemarksError(Exception):
    """An ERROR occurred which prevents further program execution."""


    def __init__(self, error_message):
        self.error_message = error_message



class PagemarksFailure(Exception):
    """An operation did not succeed, so a non-zero exit code should be returned, but it is not an error. For example,
       we may have failed to find something in a repo."""


    def __init__(self, error_message):
        self.error_message = error_message



class PagemarksAbort(Exception):
    """The program should terminate gracefully, possibly upon user request. Not an error."""


    def __init__(self, message: Optional[str] = None):
        self.message = message



def normalize_url(url: str) -> str:
    """normalize URL: protocol and hostname to lowercase (but not basic auth data), remove trailing slash"""
    p = re.compile('(https?|ftps?)://([^?/#]+?@)?([^?/#]+)([?/#].*$|$)$', re.IGNORECASE)
    m = p.match(url)
    if m:
        url = m.group(1).lower() + '://'
        if m.group(2) is not None:
            url += m.group(2)
        url += m.group(3).lower()
        pc = m.group(4)
        if pc is not None:
            if '?' in pc or '#' in pc or not pc.endswith('/') or (len(pc) <= 1 and pc != '/'):
                url += pc
            else:
                url += pc[:-1]
    return url



def normalize_tags(raw_tags: list[str]) -> list[str]:
    """Deduplicate, process commas, slugify, and sort tag list"""
    tagset = set()
    for tag in raw_tags:
        if not isinstance(tag, str):
            raise PagemarksError('syntax error: tag is not a string - ' + str(tag))
        subtags = tag.split(',')
        for subtag in subtags:
            stripped = subtag.strip()
            if len(stripped) > 0:
                tagset.add(slugify(stripped,
                        replacements=[['ä', 'ae'], ['ö', 'oe'], ['ü', 'ue'], ['Ä', 'ae'],
                                      ['Ö', 'oe'], ['Ü', 'ue'], ['ß', 'ss']]))
    return list(sorted(tagset))



def normalize_timestamp(timestamp: Optional[str]) -> Optional[str]:
    if timestamp is not None and timestamp.isdigit():
        d = datetime.fromtimestamp(int(timestamp))
        return d.strftime(DATE_FORMAT)
    return None



def normalize_date(dt: Optional[datetime]) -> Optional[str]:
    if dt is not None:
        return dt.strftime(DATE_FORMAT)
    return None



class PromptAnswer(Enum):
    YES = 'y'
    NO = 'n'
    ALL = 'a'
    QUIT = 'q'



def build_selection_desc(default_answer=PromptAnswer.NO, offer_all: bool = True, offer_quit: bool = True) -> str:
    result = '['
    result += 'Y' if default_answer == PromptAnswer.YES else 'y'
    result += '/'
    result += 'N' if default_answer == PromptAnswer.NO else 'n'
    if offer_all:
        result += '/'
        result += 'A' if default_answer == PromptAnswer.ALL else 'a'
    if offer_quit:
        result += '/'
        result += 'Q' if default_answer == PromptAnswer.QUIT else 'q'
    result += ']'
    return result



def prompt(config: CmdLine, question: str, default_answer=PromptAnswer.NO, offer_all: bool = True,
        offer_quit: bool = True) -> PromptAnswer:
    if config.yes:
        return PromptAnswer.YES
    result: PromptAnswer = default_answer
    selection_desc = build_selection_desc(default_answer, offer_all, offer_quit)
    try:
        while True:
            answer = input(question + ' ' + selection_desc + ' ')
            if len(answer.strip()) == 0:
                break
            try:
                result = PromptAnswer(answer.strip().lower()[0])
                if (result == PromptAnswer.ALL and not offer_all) or (result == PromptAnswer.QUIT and not offer_quit):
                    result = default_answer
                    continue
                break
            except ValueError:
                continue
    except EOFError:
        # Ctrl+D (*nix) / Ctrl+Z<return> (Windows) was pressed by user
        result = PromptAnswer.QUIT
    return result



def read_json_with_comments(filename: str) -> dict:
    with open(filename, 'r') as f:
        return commentjson.load(f)
