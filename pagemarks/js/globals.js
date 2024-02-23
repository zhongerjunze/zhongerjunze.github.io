/*
 * pagemarks - Free, git-backed, self-hosted bookmarks
 * Copyright (c) 2019-2021 the pagemarks contributors
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
 * License, version 3, as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/gpl.html>.
 */

// Some globally valid constants and helper functions used by all modules.

'use strict';

import { metadata } from './metadata.js'
import { encode } from './base32.js';
import { SHA1 } from './vendor/sha1.js';


/** name of the localStorage item for the api token */
const PM_SETTINGS_APITOKEN = 'pagemarks-api-token';

/** internal constant used for diffing bookmark records */
const PM_INCONSISTENT_KEYS = '__inconsistent_keys__';


/** Determine if we are currently in a "demo site", which means we have no write access to a server / backend. */
function isDemo() {
    return typeof(metadata.gitBranch) === 'string' && metadata.gitBranch === '(demo)';
}


const universalBtoa = str => {
    try {
        return btoa(str);
    } catch (err) {
        return Buffer.from(str, 'binary').toString('base64');
    }
};

const universalAtob = b64Encoded => {
    try {
        return atob(b64Encoded);
    } catch (err) {
        return Buffer.from(b64Encoded, 'base64').toString('binary');
    }
};


/**
 * Removes all empty keys from the `bookmark` object. Modifies the given object.
 * @returns the modified parameter
 */
function normalizeBookmark(bookmark)
{
    for (const p in bookmark) {
        if (bookmark.hasOwnProperty(p)) {
            if (typeof(bookmark[p]) === 'string') {
                bookmark[p] = bookmark[p].trim();
                if (bookmark[p].length === 0) {
                    delete bookmark[p];
                }
            }
            else if (Array.isArray(bookmark[p])) {
                if (bookmark[p].length === 0) {
                    delete bookmark[p];
                } else {
                    bookmark[p] = bookmark[p].filter(tag => typeof(tag) === 'string').map(tag => tag.trim());
                }
            }
        }
    }
    return bookmark;
}


/**
 * Convert a `Date` object into a String just like our Python code formats dates, so that we get the same JSON.
 * Remember that all our dates are UTC until displayed to an end user in the UI.
 * Format String: `%Y-%m-%d %H:%M:%S`
 */
function normalizeDate(dateObj)
{
    const str = dateObj.toISOString();
    const match = /([^T]+)T([^\.]+)/.exec(str);
    if (match !== null) {
        if (match[2] === '00:00:00') {
            return match[1];
        } else {
            return match[1] + ' ' + match[2];
        }
    }
    throw "invalid date: " + str;
}


/**
 * Convert a base64-encoded object to a string in UTF-8 encoding. We expect the base64-encoded object to be UTF-8.
 */
function base64ToString(encoded64)
{
    //const inputBinary = Buffer.from(encoded64, 'base64').toString('binary');
    const inputBinary = universalAtob(encoded64);
    const result = decodeURIComponent(inputBinary.split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return result;
}


function base64ToBookmark(bookmark64)
{
    const bookmark = normalizeBookmark(JSON.parse(base64ToString(bookmark64)));
    if (bookmark.hasOwnProperty('date_added')) {
        bookmark['date_added'] = new Date(bookmark['date_added']); // stay on UTC
    }
    return bookmark;
}

/*
function dateFromUtcSecs(utcSeconds)
{
    let d = new Date(utcSeconds * 1000);  // local time
    d = new Date(d.getTime() + d.getTimezoneOffset() * 60 * 1000);
    return d;
}
*/

function bookmarkToBase64(bookmark)
{
    const marker = '____,:,____';
    let b = JSON.stringify(bookmark, (k, v) => {
        if (k === 'tags') {
            return marker + JSON.stringify(v) + marker;
        }
        else if (k === 'id') {
            return undefined;
        }
        else if (k === 'date_added' && typeof(v) === 'string') {
            return normalizeDate(new Date(v));
        }
        else {
            return v;
        }
    }, 4) + '\n';

    const markerPos1 = b.indexOf('"' + marker);
    const markerPos2 = b.lastIndexOf(marker + '"');
    if (markerPos1 > 0 && markerPos2 > markerPos1) {
        const bs = b.slice(0, markerPos1);
        const be = b.slice(markerPos2 + marker.length + 1);
        let bt = b.slice(markerPos1 + marker.length + 1, markerPos2);
        bt = bt.replace(/\\\"/g, '"').replace(/,/g, ', ');
        b = bs + bt + be;
    }
    console.debug('bookmarkToBase64() - Formatted bookmark:\n' + b);
    const resultBinary = unescape(encodeURIComponent(b)); // sneak the Unicode into the base64-encoded string
    //return Buffer.from(resultBinary, 'binary').toString('base64');
    return universalBtoa(resultBinary);
}


function keyCheck(bookmark1, bookmark2)
{
    const changes = new Set();
    for (const p in bookmark1) {
        if (!Object.prototype.hasOwnProperty.call(bookmark1, p)) {
            continue;
        }
        else if (typeof(bookmark1[p]) !== typeof(bookmark2[p])) {
            if (typeof(bookmark2[p]) === 'undefined') {
                changes.add(p);
            }
            else {
                changes.add(PM_INCONSISTENT_KEYS);
            }
            continue;
        }
        if ((bookmark1[p] instanceof Date) !== (bookmark2[p] instanceof Date)) {
            changes.add(PM_INCONSISTENT_KEYS);
        }
        else if (Array.isArray(bookmark1[p]) !== Array.isArray(bookmark2[p])) {
            changes.add(PM_INCONSISTENT_KEYS);
        }
    }
    return changes;
}


function bookmarkDiff(bookmark1, bookmark2)
{
    if (typeof(bookmark1) !== typeof(bookmark2)) {
        return [PM_INCONSISTENT_KEYS];
    }
    if (typeof(bookmark1) === 'undefined') {
        return [];
    }
    if (typeof(bookmark1) !== 'object') {
        return [PM_INCONSISTENT_KEYS];
    }

    const changes = new Set([...keyCheck(bookmark1, bookmark2), ...keyCheck(bookmark2, bookmark1)]);
    if (changes.has(PM_INCONSISTENT_KEYS)) {
        return [PM_INCONSISTENT_KEYS];
    }

    if (bookmark1['name'] !== bookmark2['name']) {
        changes.add('name');
    }
    if (bookmark1['url'] !== bookmark2['url']) {
        changes.add('url');
    }
    if (bookmark1['notes'] !== bookmark2['notes']) {
        changes.add('notes');
    }
    if (Array.isArray(bookmark1['tags']) && !changes.has('tags')) {
        if (!bookmark1['tags'].every(tag => bookmark2['tags'].includes(tag))
            || !bookmark2['tags'].every(tag => bookmark1['tags'].includes(tag))) {
            changes.add('tags');
        }
    }
    // date_added is not checked because it never changes.

    return [...changes];
}


/**
 * normalize URL: protocol and hostname to lowercase (but not basic auth data), remove trailing slash
 * This must be kept in sync with the Python implementation, checked by unit tests
 */
function normalizeUrl(url)
{
    const pattern = new RegExp('(https?|ftps?):\/\/([^?/#]+?@)?([^?/#]+)([?/#].*$|$)$', 'i');
    const m = pattern.exec(url);
    let result = url;
    if (m !== null) {
        result = m[1].toLowerCase() + '://';
        if (typeof(m[2]) !== 'undefined') {
            result += m[2];
        }
        result += m[3].toLowerCase();
        const pc = m[4];
        if (typeof(pc) !== 'undefined') {
            if (pc.indexOf('?') >= 0 || pc.indexOf('#') >= 0 || !pc.endsWith('/') || (pc.length <= 1 && pc !== '/')) {
                result += pc;
            } else {
                result += pc.slice(0, -1);
            }
        }
    }
    return result;
}


function computeSha1(text)
{
    const hash = SHA1(text); // hash is a WordArray, which must be converted to Uint8Array for further processing.
    const dataArray = new Uint8Array(hash.sigBytes);
    for (let i = 0x0; i < hash.sigBytes; i++) {
        dataArray[i] = hash.words[i >>> 0x2] >>> 0x18 - i % 0x4 * 0x8 & 0xff;
    }
    return new Uint8Array(dataArray);
}


function url2filename(url)
{
    if (typeof(url) !== 'string') {
        return '00/_______invalid________.json';
    }
    const normalizedUrl = normalizeUrl(url);
    const digest = computeSha1(normalizedUrl);
    const hashcode = encode(digest).toLowerCase().slice(0, 22); // Python: BOOKMARK_ID_LEN_HASHPART
    const foldernum = digest[digest.length - 1] % Math.pow(2, 5);
    let folderstr = foldernum + '/';
    if (foldernum < 10) {
        folderstr = '0' + folderstr;
    }
    return folderstr + hashcode + '.json'
}


export {
    isDemo,
    base64ToBookmark,
    bookmarkToBase64,
    bookmarkDiff,
    normalizeBookmark,
    normalizeDate,
    url2filename,
    universalAtob,
    universalBtoa,
    PM_INCONSISTENT_KEYS,
    PM_SETTINGS_APITOKEN
};
