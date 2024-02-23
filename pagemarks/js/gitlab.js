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

// The backend SPI implementation for GitLab.

'use strict';

import { isDemo, PM_SETTINGS_APITOKEN } from './globals.js'
import { metadata } from './metadata.js'


class GitLab
{
    constructor()
    {
        this.hasWriteAccess = function() {
            const token = localStorage.getItem(PM_SETTINGS_APITOKEN);
            return typeof (metadata.gitBranch) === 'string'
                && !isDemo()
                && metadata.gitlabId > 0
                && document.body.classList.contains('pm-token-present')
                && typeof (token) === 'string';
        };


        this.id2path = function(bookmarkId) {
            return '%2F' + bookmarkId.replace('-', '%2F') + '%2Ejson';
        };


        this.performCall = function(commandName, specialSettings, successfulHttpCode, successCallback, errorCallback) {
            const token = localStorage.getItem(PM_SETTINGS_APITOKEN) || 'NOT-SET';
            const regularSettings = {
                "async": true,
                "cache": false,
                "crossDomain": true,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache",
                    "Content-Type": "application/json",
                    "Private-Token": token.trim()
                }
            };

            let effectiveSettings = {};
            $.extend(true, effectiveSettings, regularSettings, specialSettings);

            $.ajax(effectiveSettings)
                .done(function(response, textStatus, jqXHR) {
                    console.debug(commandName + '(): done; HTTP return code = ' + jqXHR.status
                        + (jqXHR.status === successfulHttpCode ? " (success)" : " (ERROR)"));
                    if (jqXHR.status === successfulHttpCode) {
                        successCallback(response);
                    } else {
                        console.error(commandName + '(): Unexpected HTTP return code: ' + jqXHR.status + ' ' + textStatus);
                        errorCallback(jqXHR.status, response.content);
                    }
                })
                .fail(function(jqXHR, textStatus, errorThrown) {
                    // TODO better alerting mechanism, e.g. with a banner at the top of the page
                    //      Should include a human-readable description of what was attempted
                    console.error(commandName + '(): Error ' + jqXHR.status + ' ' + textStatus
                        + ' - Failed to communicate with backend server');
                    console.error(commandName + '(): responseText = ' + jqXHR.responseText);
                    errorCallback(jqXHR.status, jqXHR.responseText);
                });
        };


        this.createBookmark64 = function(bookmarkId, bookmarkUrl, base64Content, successCallback, errorCallback) {
            const specialSettings = {
                "url": metadata.apiUrl + "/projects/" + metadata.gitlabId + "/repository/files/"
                    + metadata.collectionName + this.id2path(bookmarkId),
                "method": "POST",
                "processData": false,
                "data": JSON.stringify({
                    "branch": metadata.gitBranch,
                    "encoding": "base64",
                    "content": base64Content,
                    "commit_message": "Undo removal of " + bookmarkUrl + " [pagemarks]"
                })
            };

            this.performCall('createBookmark64', specialSettings, 201, response => successCallback(), errorCallback);
        };


        this.fetchBookmark64 = function(bookmarkId, successCallback, errorCallback) {
            const specialSettings = {
                "url": metadata.apiUrl + "/projects/" + metadata.gitlabId + "/repository/files/"
                    + metadata.collectionName + this.id2path(bookmarkId),
                "method": "GET",
                "processData": true,
                "data": {
                    "ref": metadata.gitBranch
                }
            };

            this.performCall('fetchBookmark64', specialSettings, 200,
                response => {
                    if (response.encoding === 'base64') {
                        successCallback(response.content);
                    } else {
                        console.error('fetchBookmark64(): Result not base64-encoded: ' + response.encoding);
                        errorCallback();
                    }
                },
                errorCallback);
        };


        this.updateBookmark64 = function(bookmarkId, bookmarkUrl, base64Content, successCallback, errorCallback) {
            const specialSettings = {
                "url": metadata.apiUrl + "/projects/" + metadata.gitlabId + "/repository/files/"
                    + metadata.collectionName + this.id2path(bookmarkId),
                "method": "PUT",
                "processData": false,
                "data": JSON.stringify({
                    "branch": metadata.gitBranch,
                    "encoding": "base64",
                    "content": base64Content,
                    "commit_message": "Update metadata of " + bookmarkUrl + " [pagemarks]"
                })
            };

            this.performCall('updateBookmark64', specialSettings, 200, response => successCallback(), errorCallback);
        };


        this.deleteBookmark = function(bookmarkId, bookmarkUrl, successCallback, errorCallback) {
            const specialSettings = {
                "url": metadata.apiUrl + "/projects/" + metadata.gitlabId + "/repository/files/"
                    + metadata.collectionName + this.id2path(bookmarkId),
                "method": "DELETE",
                "processData": false,
                "data": JSON.stringify({
                    "branch": metadata.gitBranch,
                    "commit_message": "Remove " + bookmarkUrl + " [pagemarks]"
                })
            };

            this.performCall('deleteBookmark', specialSettings, 204, response => successCallback(), errorCallback);
        };


        this.moveUpdateBookmark64 = function(bookmarkUrl, sourceLoc, targetLoc, base64Content,
            successCallback, errorCallback, urlExistsCallback) {
            const specialSettings = {
                "url": metadata.apiUrl + "/projects/" + metadata.gitlabId + "/repository/commits",
                "method": "POST",
                "processData": false,
                "data": JSON.stringify({
                    "branch": metadata.gitBranch,
                    "commit_message": "Change 'url' to " + bookmarkUrl + " [pagemarks]",
                    "actions": [{
                        "action": "move",
                        "file_path": targetLoc,
                        "previous_path": sourceLoc,
                        "encoding": "base64",
                        "content": base64Content
                    }]
                })
            };

            this.performCall('moveUpdateBookmark64', specialSettings, 201, response => successCallback(),
                (code, responseText) => {
                    if (code === 400 && (typeof(responseText) === 'string')
                        && (responseText.indexOf('name already exists') >= 0))
                    {
                        urlExistsCallback();
                    }
                    else {
                        errorCallback(code, responseText);
                    }
                }
            );
        };


        this.responseContainsApiScope = function (response) {
            let result = false;
            if (Array.isArray(response)) {
                for (let i = 0; i < response.length; i++) {
                    const scopes = response[i].scopes;
                    if (Array.isArray(scopes) && scopes.indexOf('api') >= 0) {
                        result = true; // At least one of the user's tokens has the right scope. S'all we can do.
                        break;
                    }
                }
            }
            return result;
        };


        this.validateToken = function(token, validCallback, notValidCallback) {
            const specialSettings = {
                'dataType': 'json',
                'url': metadata.apiUrl + '/personal_access_tokens',
                'method': 'GET',
                'headers': {
                    'Private-Token': token.trim()
                }
            };

            this.performCall('validateToken', specialSettings, 200,
                response => {
                    if (this.responseContainsApiScope(response)) {
                        console.debug('validate_token(): Token contains \'api\' scope. Good.');
                        validCallback();
                    } else {
                        console.warn('validate_token(): Token does not have \'api\' scope: ' + response);
                        notValidCallback();
                    }
                },
                (code, responseText) => notValidCallback());
        };
    }
}


export { GitLab };
