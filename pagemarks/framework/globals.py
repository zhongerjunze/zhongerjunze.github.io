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

BOOKMARK_ID_LEN_HASHPART: int = 22
"""The number of characters of the base32 hash used for the bookmark ID. KEEP IN SYNC WITH JS IMPLEMENTATION"""

BOOKMARK_ID_LEN: int = BOOKMARK_ID_LEN_HASHPART + 3
"""The total length of a bookmark ID in characters, including folder number. This ID is enough to uniquely identify
   the corresponding file in a collection."""

DEFAULT_COLL_NAME: str = 'default'
"""Name of the default collection"""
