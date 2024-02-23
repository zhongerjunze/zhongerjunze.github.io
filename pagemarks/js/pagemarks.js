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


import { readMetadataFromPage } from './metadata.js'
import { setCssTheme, bindEventHandlersCssTheme } from './css-theme.js'
import { isDemo } from './globals.js'
import { apiTokenInitPage, bindEventHandlersSettings } from './settings.js'
import { bindEventHandlersDelete } from './delete.js'
import { bindEventHandlersEdit } from './edit.js'



function showDemoNotice()
{
    if (isDemo()) {
        document.getElementById('pm-demo-announce').classList.remove('d-none');
    }
}


/**
 * Function executed once when the DOM document is ready, performing initialization procedures.
 */
function pagemarksMain()
{
    readMetadataFromPage();
    setCssTheme();
    showDemoNotice();
    document.body.removeAttribute('style');

    const Shuffle = window.Shuffle;
    const element = document.querySelector('.pagemarks-shuffle-container');

    const shuffleInstance = new Shuffle(element, {
        itemSelector: '.pagemarks-item',
        sizer: '.pagemarks-shuffle-container:first-child'
    });

    const inputForm = $('#pagemarks-filter');
    inputForm.on('submit', null, shuffleInstance, updateFilter);
    const queryStringParam = getQueryStringParameters()['q'];
    const presetFilter = queryStringParam ? decodeURIComponent(queryStringParam) : '';
    if (presetFilter) {
        inputForm.find('input')[0].setAttribute('value', presetFilter);
        inputForm.submit();
    }

    bindEventHandlers();
    setTimeout(apiTokenInitPage, 500);
}


function updateFilter(event) {
    event.preventDefault();
    const filterExpression = getValueFromInput('pagemarks-filter input', '');
    const filterParsed = parseQuery(filterExpression);
    console.log("filter changed - " + JSON.stringify(filterParsed));
    if (filterParsed.isEmpty) {
        updateQueryStringInBrowser('');
        event.data.filter(Shuffle.ALL_ITEMS);
    } else {
        updateQueryStringInBrowser(query2String(filterParsed));
        event.data.filter(pElement => shuffleFilter(pElement, filterParsed));
    }
    return false;
}


function updateQueryStringInBrowser(pNewQueryString) {
    if ('URLSearchParams' in window) {
        const searchParams = new URLSearchParams(window.location.search);
        let newRelativePathQuery = window.location.pathname;
        if (pNewQueryString.length > 0) {
            searchParams.set("q", pNewQueryString);
            newRelativePathQuery += '?' + searchParams.toString();
        }
        history.replaceState(null, '', newRelativePathQuery);
    }
}


function query2String(pFilterQuery) {
    let result = '';
    if (pFilterQuery.tags.length > 0) {
        for (let i = 0; i < pFilterQuery.tags.length; i++) {
            result += '[' + pFilterQuery.tags[i] + '] ';
        }
    }
    if (pFilterQuery.words.length > 0) {
        result += pFilterQuery.words.join(' ');
    }
    if (result.endsWith(' ')) {
        result = result.slice(0, result.length - 1);
    }
    return result;
}


function getValueFromInput(pInputFieldName, pDefault) {
    let result = pDefault;
    const v = $('#' + pInputFieldName).val();
    if (typeof (v) === 'string' && v.trim().length > 0) {
        result = v.trim();
    }
    return result;
}


function shuffleFilter(pElement, pFilter) {
    let result = true;
    if (pFilter.tags.length > 0) {
        const elementGroups = JSON.parse(pElement.getAttribute('data-groups'));
        result = pFilter.tags.every(tag => elementGroups.includes(tag));
    }
    if (result && pFilter.words.length > 0) {
        const searchText = pElement.getAttribute('data-searchtext');
        result = pFilter.words.every(word => searchText.indexOf(word) !== -1);
    }
    return result;
}


const ParserState = Object.freeze({
    'NEUTRAL': 1,
    'WORD': 2,
    'QUOTED': 3,
    'TAG': 4
});


function parseQuery(pQuery) {
    let result = {
        'words': [],
        'tags': []
    };
    if (typeof (pQuery) !== 'undefined' && pQuery !== null) {
        if (typeof (pQuery) === 'string' && pQuery.trim().length > 0) {
            result = pq(pQuery.trim());
            for (let i = 0; i < result.words.length; i++) {
                result.words[i] = result.words[i].toLowerCase();
            }
            for (let i = 0; i < result.tags.length; i++) {
                result.tags[i] = result.tags[i].toLowerCase();
            }
        }
    }
    result.isEmpty = result.words.length === 0 && result.tags.length === 0;
    return Object.freeze(result);
}


function pq(pString) {
    let parserState = ParserState.NEUTRAL;
    let currentTerm = '';
    const result = {
        'words': [],
        'tags': []
    };

    for (let pos = 0; pos < pString.length; pos++) {
        const c = pString[pos];
        if (parserState === ParserState.NEUTRAL) {
            if (c === '"') {
                parserState = ParserState.QUOTED;
            } else if (c === '[') {
                parserState = ParserState.TAG;
            } else if (c !== ' ' && c !== '\t') {
                parserState = ParserState.WORD;
                currentTerm += c;
            }
        } else if (parserState === ParserState.WORD) {
            if (c !== ' ' && c !== '\t') {
                currentTerm += c;
            } else {
                if (currentTerm.length > 0) {
                    result.words.push(currentTerm);
                    currentTerm = '';
                }
                parserState = ParserState.NEUTRAL;
            }
        } else if (parserState === ParserState.QUOTED) {
            if (isClosingQuote(pString, pos)) {
                if (currentTerm.length > 0) {
                    result.words.push(currentTerm);
                    currentTerm = '';
                }
                parserState = ParserState.NEUTRAL;
            } else {
                currentTerm += c;
            }
        } else if (parserState === ParserState.TAG) {
            if (c === ']') {
                if (currentTerm.length > 0) {
                    result.tags.push(currentTerm);
                    currentTerm = '';
                }
                parserState = ParserState.NEUTRAL;
            } else {
                currentTerm += c;
            }
        } else {
            throw new Error('Unknown parser state: ' + parserState);
        }
    }
    if (currentTerm.length > 0) {
        result.words.push(currentTerm);
    }
    return result;
}


function isClosingQuote(pString, pPos) {
    let result = false;
    if (pString[pPos] === '"') {
        let bsCount = 0;
        for (let p = pPos - 1; p >= 0; p--) {
            if (pString[p] === '\\') {
                bsCount++;
            } else {
                break;
            }
        }
        if (bsCount % 2 === 0) { // quote is not escaped
            if (pPos === pString.length - 1) {
                result = true;
            } else {
                const c = pString[pPos + 1];
                if (c === ' ' || c === '\t') {
                    result = true;
                }
            }
        }
    }
    return result;
}


function getQueryStringParameters() {
    const queryString = window.location.search.slice(1);
    const result = {};
    if (queryString != null && queryString !== "") {
        const prmarr = queryString.split("&");
        for (let i = 0; i < prmarr.length; i++) {
            const tmparr = prmarr[i].split("=");
            result[tmparr[0]] = tmparr[1].replace(/\+/g, '%20');
        }
    }
    return result;
}


function pagemarksClearFilter()
{
    const inputForm = $('#pagemarks-filter');
    inputForm.find('input')[0].value = '';
    inputForm.submit();
}


function bindEventHandlers()
{
    $('.pm-onclick-clear-filter').on('click', pagemarksClearFilter);
    bindEventHandlersCssTheme();
    bindEventHandlersSettings();
    bindEventHandlersDelete();
    bindEventHandlersEdit();
}


export { parseQuery };


/* This is executed once when the module is loaded: */
if (typeof($) === 'function') {
    $(document).ready(pagemarksMain);
}
