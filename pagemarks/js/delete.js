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

'use strict';

import { isDemo } from './globals.js'
import { GitLab } from './gitlab.js'
import { PagemarksSpi } from './spi.js'


function git_write_access()
{
    const spi = new PagemarksSpi();    // TODO access to SPI instance should be encapsulated
    spi.setImplementation(new GitLab());

    return spi.hasWriteAccess();
}


function get_bookmark_url(bookmarkId)
{
    const jqElem = $('#' + bookmarkId + ' .card-body a').first();
    if (typeof(jqElem.attr('href')) === 'string') {
        return jqElem.attr('href');
    }
    return jqElem.attr('href-save');  /* if the bookmark has been deleted, and the link disabled */
}


function git_delete_bookmark(bookmarkId, successCallback, errorCallback)
{
    const spi = new PagemarksSpi();
    spi.setImplementation(new GitLab());

    const bookmark_url = get_bookmark_url(bookmarkId);
    spi.deleteBookmark(bookmarkId, bookmark_url,
        () => successCallback(bookmarkId, true),
        () => errorCallback(bookmarkId, true)
    );
}


function git_fetch_bookmark64(bookmarkId, successCallback, errorCallback)
{
    const spi = new PagemarksSpi();
    spi.setImplementation(new GitLab());

    spi.fetchBookmark64(bookmarkId, successCallback, () => errorCallback(bookmarkId, true));
}


function git_create_bookmark64(bookmarkId, base64Content, successCallback, errorCallback)
{
    const spi = new PagemarksSpi();
    spi.setImplementation(new GitLab());

    const bookmark_url = get_bookmark_url(bookmarkId);
    spi.createBookmark64(bookmarkId, bookmark_url, base64Content,
        () => successCallback(bookmarkId, false),
        () => errorCallback(bookmarkId, false));
}


function getThemeType() {
    const cl = document.body.classList;
    return cl.contains('pm-themetype-dark') ? 'dark' : 'light';
}


function removeClasses(classList, prefix)
{
    classList.remove.apply(classList, Array.from(classList).filter(v => v.startsWith(prefix)));
}


function renameAttribute(jqElem, attrNameOld, attrNameNew)
{
    const oldVal = jqElem.attr(attrNameOld);
    jqElem.attr(attrNameNew, oldVal);
    jqElem.removeAttr(attrNameOld);
}


function toggleUndoLink(bookmarkId, isDeleted)
{
    const cl = $('#' + bookmarkId + ' .card-toolbox a.pm-undo').prop('classList');
    if (isDeleted) {
        cl.remove('d-none');
    } else {
        cl.add('d-none');
    }
}


function toggleToolboxIcons(bookmarkId, isDeleted)
{
    $('#' + bookmarkId + ' .card-toolbox i').each(function() {
        const cl = $(this).prop('classList');
        if (isDeleted) {
            cl.add('d-none');
        } else {
            cl.remove('d-none');
        }
    });
}


function markCardDeleted(bookmarkId, isDeleted)
{
    let cl = $('#' + bookmarkId + ' .card').prop('classList');
    removeClasses(cl, 'border-');
    if (isDeleted) {
        cl.add('border-' + getThemeType());
        cl.add('pm-deleted');
    } else {
        cl.add('border-primary');
        cl.remove('pm-deleted');
    }

    if (!isDeleted) {
        toggleUndoLink(bookmarkId, false);
    } else {
        toggleToolboxIcons(bookmarkId, true);
    }

    $('#' + bookmarkId + ' .card-body a').each(function() {
        cl = $(this).prop('classList');
        if (isDeleted) {
            cl.add('disabled');
            renameAttribute($(this), 'href', 'href-save');
        } else {
            cl.remove('disabled');
            renameAttribute($(this), 'href-save', 'href');
        }
    });

    const toolbox = $('#' + bookmarkId + ' .card > .card-toolbox');
    if (isDeleted) {
        renameAttribute(toolbox, 'onclick', 'onclick-save');
    } else {
        /* Use small delay so that the click event does not immediately trigger a new deletion: */
        setTimeout(() => renameAttribute(toolbox, 'onclick-save', 'onclick'), 100);
    }
}


/**
 * Error handler for the remote calls. When a remote call fails, we must restore the card to its previous state.
 * @param bookmarkId the bookmark ID
 * @param isDeleted `true` if we were trying to delete the bookmark (we didn't, because it failed, but we tried),
 *          so `true` --> card should be normal, `false` --> card should be grayed out
 */
function errorHandler(bookmarkId, isDeleted)
{
    markCardDeleted(bookmarkId, !isDeleted);
    toggleUndoLink(bookmarkId, !isDeleted);
    toggleToolboxIcons(bookmarkId, !isDeleted);
}


function deleteBookmark(bookmarkId)
{
    if (isDemo()) {
        markCardDeleted(bookmarkId, true);
        toggleUndoLink(bookmarkId, true);
        return false;
    }
    if (!git_write_access()) {    // TODO Can this check and message be part of the remote gitlab api layer?
        console.log('deleteBookmark(): Write access to the server is not enabled.\n' +
            'It shouldn\'t even have been possible to invoke this function ...');
        return false;
    }
    markCardDeleted(bookmarkId, true);
    git_fetch_bookmark64(bookmarkId, function(original64) {
        $('#' + bookmarkId).attr('data-original64', original64);
        git_delete_bookmark(bookmarkId, toggleUndoLink, errorHandler);
    }, errorHandler);
}


function undoDeleteBookmark(bookmarkId)
{
    if (isDemo()) {
        markCardDeleted(bookmarkId, false);
        toggleToolboxIcons(bookmarkId, false);
        return false;
    }
    if (!git_write_access()) {
        console.log('undoDeleteBookmark(): Write access to the server is not enabled.\n' +
            'It shouldn\'t even have been possible to invoke this function ...');
        return false;
    }
    markCardDeleted(bookmarkId, false);
    git_create_bookmark64(bookmarkId, $('#' + bookmarkId).attr('data-original64'), toggleToolboxIcons, errorHandler);
}


function bindEventHandlersDelete()
{
    $('.pm-onclick-bm-delete').on('click', event => deleteBookmark($(event.target).attr('data-pm-bm-id')));
    $('.pm-onclick-bm-undo-delete').on('click', event => undoDeleteBookmark($(event.target).attr('data-pm-bm-id')));
}


export { bindEventHandlersDelete };
