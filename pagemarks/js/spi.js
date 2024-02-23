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

// The service provider interface (SPI), that is the code we use to access the backend.

'use strict';


class PagemarksSpi
{
    constructor() {
        this.backend = '(NOT_SET)';
    }


    setImplementation(backend) {
        this.backend = backend;
    }


    hasWriteAccess() {
        return this.backend.hasWriteAccess();
    }


    createBookmark64(bookmarkId, bookmarkUrl, base64Content, successCallback, errorCallback) {
        return this.backend.createBookmark64(bookmarkId, bookmarkUrl, base64Content, successCallback,
        errorCallback);
    }


    fetchBookmark64(bookmarkId, successCallback, errorCallback) {
        return this.backend.fetchBookmark64(bookmarkId, successCallback, errorCallback);
    }


    updateBookmark64(bookmarkId, bookmarkUrl, base64Content, successCallback, errorCallback) {
        return this.backend.updateBookmark64(bookmarkId, bookmarkUrl, base64Content, successCallback,
        errorCallback);
    }


    deleteBookmark(bookmarkId, bookmarkUrl, successCallback, errorCallback) {
        return this.backend.deleteBookmark(bookmarkId, bookmarkUrl, successCallback, errorCallback);
    }


    moveUpdateBookmark64(bookmarkUrl, sourceLoc, targetLoc, base64Content,
        successCallback, errorCallback, urlExistsCallback) {
        return this.backend.moveUpdateBookmark64(bookmarkUrl, sourceLoc, targetLoc, base64Content,
            successCallback, errorCallback, urlExistsCallback);
    }


    validateToken(token, validCallback, notValidCallback) {
        return this.backend.validateToken(token, validCallback, notValidCallback);
    }
}


export { PagemarksSpi };
