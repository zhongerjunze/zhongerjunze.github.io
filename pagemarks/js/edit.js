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

import { isDemo, base64ToBookmark, bookmarkToBase64, bookmarkDiff, normalizeBookmark, url2filename } from './globals.js'
import { GitLab } from './gitlab.js'
import { metadata } from './metadata.js'
import { PagemarksSpi } from './spi.js'


function addTagToList(tagify, event)
{
    const tagList = tagify.settings.whitelist;
    const newTag = event.detail.data.value;
    if (!tagList.includes(newTag)) {
        tagList.push(newTag);
        tagList.sort();
        console.debug('New tag created: ' + newTag);
    }
}


function readBookmarkFromHtmlCard(bookmarkId)
{
    const result = {};

    const name = $('#' + bookmarkId + ' .card-body .card-title').first().attr('data-pm-full-name');
    if (typeof(name) === 'string' && name.trim().length > 0) {
        result['name'] = name.trim();
    }

    const url = $('#' + bookmarkId + ' .card-body .pm-url > a').first().attr('href');
    if (typeof(url) === 'string') {
        result['url'] = url.trim();
    }

    const tags = $('#' + bookmarkId + ' .pm-card-tags > a > span.badge').toArray().map(item => $(item).html());
    if (Array.isArray(tags) && tags.length > 0) {
        result['tags'] = tags;
    }

    const notes = $('#' + bookmarkId + ' .card-body p.pm-notes').first().text();
    if (typeof(notes) === 'string' && notes.trim().length > 0) {
        result['notes'] = notes.trim();
    }

    const dateAddedSecs = $('#' + bookmarkId).attr('data-date-added');
    if (typeof(dateAddedSecs) === 'string' && !isNaN(dateAddedSecs)) {
        result['date_added'] = new Date(parseInt(dateAddedSecs) * 1000);
    }

    return result;
}


function readBookmarkFromDialog()
{
    const result = {};

    const bookmarkId = document.getElementById('pm-bm-edit-id').value;

    const name = document.getElementById('pm-bm-edit-name').value;
    if (typeof(name) === 'string') {
        result['name'] = name.trim();
    }

    const url = document.getElementById('pm-bm-edit-url').value;
    if (typeof(url) === 'string') {
        result['url'] = url.trim();
    }

    let tags = [];
    const tagsRaw = document.getElementById('pm-bm-edit-tags').value;
    if (typeof(tagsRaw) === 'string' && tagsRaw.trim().length > 0) {
        tags = JSON.parse(tagsRaw).map(v => v.value.toLowerCase()).sort();
    }
    result['tags'] = tags;

    const notes = document.getElementById('pm-bm-edit-notes').value;
    if (typeof(notes) === 'string') {
        result['notes'] = notes.trim();
    }

    // date added is not present in dialog, so we take it from the card, where it's stored as UTC seconds
    const dateAddedSecs = $('#' + bookmarkId).attr('data-date-added');
    if (typeof(dateAddedSecs) === 'string' && !isNaN(dateAddedSecs)) {
        result['date_added'] = new Date(parseInt(dateAddedSecs) * 1000);
    }

    return result;
}


function buildSearchText(bookmark)
{
    let result = '';
    if (bookmark.hasOwnProperty('name') && typeof(bookmark.name) === 'string') {
        result += bookmark.name.trim().toLowerCase();
    }
    if (bookmark.hasOwnProperty('tags') && Array.isArray(bookmark.tags) && bookmark.tags.length > 0) {
        result += ' ' + bookmark.tags.join(' ');
    }
    if (bookmark.hasOwnProperty('url') && bookmark.url.length > 0) {
        const re = new RegExp('^(?:(?:https?|ftps?):\/\/)?(.*?)(?:\.s?html?)?$', 'i');
        const m = re.exec(decodeURI(bookmark.url));
        if (m !== null) {
            result += ' ' + m[1].toLowerCase();
        }
    }
    return result;
}


function writeBookmarkToHtmlCard(bookmarkId, bookmark, bookmarkIdNew)
{
    const titleElem = $('#' + bookmarkId + ' .card-body .card-title').first();
    const titleAttr = titleElem.attr('title');
    if (bookmark.hasOwnProperty('name')) {
        titleElem.attr('data-pm-full-name', bookmark.name);
        if (typeof(titleAttr) !== 'undefined' && titleAttr !== false) {
            titleElem.attr('title', bookmark.name);
        }
        // truncation must match what our Python code does: `bookmark.name[:86] + ' ...'`
        const limitedName = bookmark.name.length > 90 ? (bookmark.name.slice(0, 86) + ' ...') : bookmark.name;
        titleElem.text(limitedName);
    }
    else {
        titleElem.attr('data-pm-full-name', '');
        if (typeof(titleAttr) !== 'undefined' && titleAttr !== false) {
            titleElem.attr('title', '');
        }
        titleElem.text('');
    }

    $('#' + bookmarkId + ' .pm-card-tags > a').remove();
    if (bookmark.hasOwnProperty('tags') && Array.isArray(bookmark.tags)) {
        const tagContainer = $('#' + bookmarkId + ' .pm-card-tags');
        bookmark.tags.forEach(tag => {
            // Python: escape(self.baseurl + '/index.html?q=[' + tag + ']')
            const tagQueryLink = metadata.baseUrl + '/'
                + (metadata.collectionName === 'default' ? 'index' : metadata.collectionName)
                + '.html?q=[' + tag + ']';
            const tagHtml = '<a href="' + tagQueryLink + '"><span class="badge bg-primary">' + tag + '</span></a> ';
            tagContainer.append(tagHtml);
        });
        $('#' + bookmarkId).attr('data-groups', JSON.stringify(bookmark.tags));
    }
    else {
        $('#' + bookmarkId).attr('data-groups', '[]');
    }

    const notesElem = $('#' + bookmarkId + ' .card-body p.pm-notes').first();
    if (bookmark.hasOwnProperty('notes')) {
        notesElem.text(bookmark.notes);
    } else {
        notesElem.text('');
    }

    $('#' + bookmarkId).attr('data-searchtext', buildSearchText(bookmark));

    if (bookmark.hasOwnProperty('url') && bookmark.url.length > 0) {
        const urlElem = $('#' + bookmarkId + ' .card-body .pm-url > a').first();
        urlElem.attr('href', bookmark.url);
        urlElem.text(bookmark.url);
        // Changed URL means changed ID
        $('#' + bookmarkId + ' .card-toolbox').children().each((idx, elem) => {
            if (elem.hasAttribute('data-pm-bm-id')) {
                elem.setAttribute('data-pm-bm-id', bookmarkIdNew);
            }
        });
        $('#pm-bm-edit-id').val(bookmarkIdNew);
        $('#' + bookmarkId).attr('id', bookmarkIdNew);  // DO THIS LAST !!!
    }

    // Card dimensions may have changed, for example when data was deleted. Adjust the other cards.
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
}


function displayErrorMsgInModal(msg)
{
    const alertElem = $('#pm-edit-bookmark-modal .modal-body .alert').first();
    if (typeof(msg) === 'string') {
        console.error(msg);
        $('#pm-edit-bookmark-modal .pm-bm-edit-errormsg').first().text(msg);
        alertElem.prop('classList').remove('d-none');
    }
    else {
        alertElem.prop('classList').add('d-none');
    }
}


function errorHandler(bookmarkId)
{
    displayErrorMsgInModal('Remote backend call failed for bookmark \'' + bookmarkId
        + '\'. Normally, this happens when we are out of sync with the server. Consider refreshing the page.');
}


function git_fetch_bookmark(bookmarkId, successCallback, errorCallback)
{
    const spi = new PagemarksSpi();
    spi.setImplementation(new GitLab());

    spi.fetchBookmark64(bookmarkId, successCallback, () => errorCallback(bookmarkId));
}


function git_update_bookmark(bookmarkId, bookmarkUrl, base64Content, successCallback, errorCallback)
{
    const spi = new PagemarksSpi();
    spi.setImplementation(new GitLab());

    spi.updateBookmark64(bookmarkId, bookmarkUrl, base64Content, successCallback, () => errorCallback(bookmarkId));
}


function git_move_update_bookmark64(bookmarkUrl, sourceLoc, targetLoc, base64Content,
    successCallback, errorCallback, urlExistsCallback)
{
    const spi = new PagemarksSpi();
    spi.setImplementation(new GitLab());

    spi.moveUpdateBookmark64(bookmarkUrl, sourceLoc, targetLoc, base64Content,
        successCallback, errorCallback, urlExistsCallback);
}


function enterButtonHandler(event)
{
    if (event.keyCode == 13 || event.which == 13) {
        // enter was pressed -> Okay button
        event.preventDefault();
        if (!$('#pm-edit-bookmark-modal button.pm-onclick-bm-save').prop('classList').contains('disabled')) {
            saveBookmark();
        }
    }
}


function populateDialog(bookmarkId, bookmark, bookmark64)
{
    console.debug('populateDialog(): Current bookmark = ' + JSON.stringify(bookmark));

    $('#pm-bm-edit-id').val(bookmarkId);
    $('#pm-bm-edit-url').val(bookmark.url);
    $('#pm-bm-edit-name').val(bookmark.name ? bookmark.name : '');
    $('#pm-bm-edit-notes').val(bookmark.notes ? bookmark.notes : '');

    const inputEditTags = document.querySelector('#pm-bm-edit-tags');
    inputEditTags.value = bookmark.hasOwnProperty('tags') && bookmark.tags.length > 0 ? bookmark.tags.join(', ') : '';
    if (!inputEditTags.previousElementSibling || !inputEditTags.previousElementSibling.classList.contains('tagify')) {
        const tagify = new Tagify(inputEditTags, {
            whitelist: metadata.allTags,
            dropdown: {
                classname: "pm-tag-suggest"
            }
        });
        tagify
            .on('add', event => addTagToList(tagify, event))
            .on('edit:updated', event => addTagToList(tagify, event));
    }

    $('#pm-edit-bookmark-modal').attr('data-pm-original64', bookmark64);
}


function clearModal()
{
    $('#pm-bm-edit-id').val('');
    $('#pm-bm-edit-name').val('');
    $('#pm-bm-edit-url').val('');
    $('#pm-bm-edit-tags').val('');
    $('#pm-bm-edit-notes').val('');
    displayUrlExistsMessage(false);
    displayErrorMsgInModal(undefined);
}


function populateDialogWrapper(bookmarkId, bookmark, bookmark64)
{
    populateDialog(bookmarkId, bookmark, bookmark64);
    toggleLoadingAnimation(false);

    const nameInputBox = document.getElementById('pm-bm-edit-name');
    nameInputBox.focus();
    // move cursor to end of input:
    nameInputBox.scrollLeft = nameInputBox.scrollWidth;
    nameInputBox.setSelectionRange(nameInputBox.value.length, nameInputBox.value.length);
}


function toggleLoadingAnimation(isLoading)
{
    if (isLoading) {
        $('#pm-edit-bookmark-modal .pm-bm-edit-loading').first().prop('classList').remove('d-none');
        $('#pm-edit-bookmark-modal form').first().prop('classList').add('d-none');
        enableSaveButton(false);
    }
    else {
        $('#pm-edit-bookmark-modal .pm-bm-edit-loading').first().prop('classList').add('d-none');
        $('#pm-edit-bookmark-modal form').first().prop('classList').remove('d-none');
        enableSaveButton(true);
    }
}


function editBookmark(bookmarkId)
{
    console.debug('editBookmark(\'' + bookmarkId + '\') - enter');

    displayUrlExistsMessage(false);
    toggleLoadingAnimation(true);
    displayErrorMsgInModal(undefined);
    $('#pm-edit-bookmark-modal').modal('show');
    $('#pm-bm-edit-name').off('keyup').on('keyup', enterButtonHandler);
    $('#pm-bm-edit-url').off('keyup').on('keyup', enterButtonHandler);

    if (isDemo()) {
        const bookmark = readBookmarkFromHtmlCard(bookmarkId);
        populateDialogWrapper(bookmarkId, bookmark, bookmarkToBase64(bookmark));
    }
    else {
        git_fetch_bookmark(bookmarkId,
            content64 => populateDialogWrapper(bookmarkId, base64ToBookmark(content64), content64),
            errorHandler
        );
    }

    console.debug('editBookmark() - exit');
}


function hideModal()
{
    console.debug('hideModal() - enter');

    $('#pm-bm-edit-name').off('keyup');
    $('#pm-bm-edit-url').off('keyup');
    $('#pm-edit-bookmark-modal').modal('hide');
    clearModal();  // prevent data flashing on next use

    console.debug('hideModal() - exit');
}


function bookmarkPresentOnPage(bookmarkId)
{
    const elem = $('#' + bookmarkId);
    return elem.length > 0;
}


function displayUrlExistsMessage(displayError)
{
    const inputElem = document.getElementById('pm-bm-edit-url');
    const msgElem = inputElem.nextElementSibling;
    const formGrpElem = inputElem.parentElement.parentElement;
    if (displayError) {
        formGrpElem.classList.add('has-danger');
        inputElem.classList.add('is-invalid');
        msgElem.classList.remove('d-none');
        const triggerEv = event => {
            inputElem.removeEventListener('keyup', triggerEv);
            displayUrlExistsMessage(false);
        };
        inputElem.addEventListener('keyup', triggerEv);
    }
    else {
        formGrpElem.classList.remove('has-danger');
        inputElem.classList.remove('is-invalid');
        msgElem.classList.add('d-none');
    }
}


function enableSaveButton(enableButton)
{
    const button = $('#pm-edit-bookmark-modal button.pm-onclick-bm-save').first();
    if (enableButton) {
        button[0].classList.remove('disabled');
    } else {
        button[0].classList.add('disabled');
    }
}


function updateBookmarkSameUrl(bookmarkId, bookmarkNew, content64)
{
    if (isDemo()) {
        writeBookmarkToHtmlCard(bookmarkId, bookmarkNew, bookmarkId);
        hideModal();
    }
    else {
        git_update_bookmark(bookmarkId, bookmarkNew.url, content64, () => {
            writeBookmarkToHtmlCard(bookmarkId, bookmarkNew, bookmarkId);
            hideModal();
        }, errorHandler);
    }
}


function updateBookmarkUrlChanged(bookmarkId, bookmarkNew, content64)
{
    const newFilename = url2filename(bookmarkNew.url);
    const newid = newFilename.replace('/', '-').slice(0, -1 * '.json'.length);
    if (bookmarkPresentOnPage(newid)) {
        displayUrlExistsMessage(true);
        enableSaveButton(true);
        return;
    }
    else if (isDemo()) {
        writeBookmarkToHtmlCard(bookmarkId, bookmarkNew, newid);
        hideModal();
    }
    else {
        const sourceLoc = metadata.collectionName + '/' + bookmarkId.replace('-', '/') + '.json';
        const targetLoc = metadata.collectionName + '/' + newFilename;
        git_move_update_bookmark64(bookmarkNew.url, sourceLoc, targetLoc, content64,
            () => { // success
                writeBookmarkToHtmlCard(bookmarkId, bookmarkNew, newid);
                hideModal();
            },
            (code, responseText) => { // unexpected error
                errorHandler(bookmarkId);
            },
            () => { // url exists on server
                displayUrlExistsMessage(true);
                enableSaveButton(true);
            }
        );
    }
}


function saveBookmark()
{
    console.debug('saveBookmark() - enter');

    enableSaveButton(false);

    const bookmarkId = document.getElementById('pm-bm-edit-id').value;
    const bookmarkOld = base64ToBookmark($('#pm-edit-bookmark-modal').attr('data-pm-original64'));
    const bookmarkNew = normalizeBookmark(readBookmarkFromDialog());
    console.debug('saveBookmark() - old: ' + JSON.stringify(bookmarkOld));
    console.debug('saveBookmark() - new: ' + JSON.stringify(bookmarkNew));
    const diff = bookmarkDiff(bookmarkOld, bookmarkNew);
    if (diff.length > 0) {
        console.debug('saveBookmark() - bookmark was changed in dialog: ' + JSON.stringify(diff));
        const bookmarkNew64 = bookmarkToBase64(bookmarkNew);
        console.debug('saveBookmark() - bookmarkNew64 = ' + bookmarkNew64);
        if (diff.indexOf('url') >= 0) {
            updateBookmarkUrlChanged(bookmarkId, bookmarkNew, bookmarkNew64);
        }
        else {
            updateBookmarkSameUrl(bookmarkId, bookmarkNew, bookmarkNew64);   // will hide modal if successful
        }
    }
    else {
        console.debug('saveBookmark() - bookmark unchanged');
        hideModal();
    }

    console.debug('saveBookmark() - exit');
}


function bindEventHandlersEdit()
{
    $('.pm-onclick-bm-edit').on('click', event => editBookmark($(event.target).attr('data-pm-bm-id')));
    $('.pm-onclick-bm-save').on('click', saveBookmark);
    $('.pm-onclick-bm-cancel').on('click', hideModal);
}


export { bindEventHandlersEdit };
