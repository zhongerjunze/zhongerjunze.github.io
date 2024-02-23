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


const metadata =
{
    /** name of the git branch the current collection lives on */
    gitBranch: '',

    /** ID of the project on the GitLab server where our bookmarks are hosted */
    gitlabId: 0,

    /** base URL of the backend server API */
    apiUrl: '',

    /** base URL of the generated website */
    baseUrl: '',

    /** Name of the current collection */
    collectionName: '',

    /** list of supported CSS themes as a map from theme name to icon name */
    cssThemes: {},

    /** complete list of all tags used by all bookmarks of the collection, at the moment of site generation,
     *  sorted alphabetically, de-duplicated */
    allTags: []
};



function readMetadataFromPage()
{
    let meta = $('head > meta[name="pm-global-git-branch"]');
    metadata.gitBranch = meta.attr('content');

    meta = $('head > meta[name="pm-global-gitlab-id"]');
    metadata.gitlabId = parseInt(meta.attr('content'));

    meta = $('head > meta[name="pm-global-api-url"]');
    metadata.apiUrl = meta.attr('content');

    meta = $('head > meta[name="pm-global-base-url"]');
    metadata.baseUrl = meta.attr('content');

    meta = $('head > meta[name="pm-global-collection-name"]');
    metadata.collectionName = meta.attr('content');

    meta = $('head > meta[name="pm-global-css-themes"]');
    metadata.cssThemes = JSON.parse($.parseHTML(meta.attr('content'))[0].textContent);

    console.debug('Parsed metadata from collection page: ' + JSON.stringify(metadata));
}


export { metadata, readMetadataFromPage };
