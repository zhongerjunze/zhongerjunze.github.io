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

import { metadata } from './metadata.js'


const PM_COLOR_THEME = 'pagemarks-color-theme';  /* name of the localStorage item for the selected color theme */
const PM_DEFAULT_THEME_NAME = 'darkly';


function readThemeNameFromLocalStorage() {
    let themeName = localStorage.getItem(PM_COLOR_THEME);
    if (themeName == null) {
        themeName = PM_DEFAULT_THEME_NAME;
    }
    return themeName;
}


function highlightDropdownList(themeName)
{
    let themeList = document.getElementById('navbarColorTheme');
    themeList = themeList.nextSibling.nextSibling.childNodes; // jump over a text node
    for (let i = 0; i < themeList.length; i++) {
        // iterate over anchors
        if (themeList[i].classList && themeList[i].classList.contains('dropdown-divider')) {
            break;  // stop at divider, no themes below this line
        }
        if (typeof(themeList[i].text) === 'string') {
            const cl = themeList[i].childNodes[2].classList;
            if (themeList[i].text.trim() === themeName) {
                cl.remove('invisible');
                cl.add('visible');
            }
            else {
                cl.remove('visible');
                cl.add('invisible');
            }
        }
    }
}


function switchMainStylesheet(themeName) {
    const styleSheetLink = $('head > link[data-css="main"]');
    const regex = /^(.+?_)[a-z]+\.css$/;
    const m = regex.exec(styleSheetLink.attr('href'))
    let newUrl = styleSheetLink.attr('href');
    if (m !== null) {
        newUrl = m[1] + themeName + '.css';
    }
    styleSheetLink.attr('href', newUrl);
}


function indicateThemeType(themeName)
{
    const isDark = metadata.cssThemes[themeName] === 'sun';
    const cl = document.body.classList;
    if (isDark && !cl.contains('pm-themetype-dark')) {
        cl.add('pm-themetype-dark');
        cl.remove('pm-themetype-light');
    }
    else if (!isDark && !cl.contains('pm-themetype-light')) {
        cl.add('pm-themetype-light');
        cl.remove('pm-themetype-dark');
    }
}


function fix_superhero_navbar(themeName) {
    const navbar = $('nav.navbar');
    if (themeName === 'superhero') {    // one day, this should be a property of css-themes.json
        navbar.removeClass('bg-primary');
        navbar.addClass('bg-dark');
    } else {
        navbar.removeClass('bg-dark');
        navbar.addClass('bg-primary');
    }
}


function setCssTheme(themeName)
{
    console.debug('setCssTheme(\'' + themeName + '\') - enter');

    if (themeName !== undefined) {
        event = event || window.event;
        event.preventDefault();
    }
    themeName = themeName || readThemeNameFromLocalStorage();

    highlightDropdownList(themeName);
    switchMainStylesheet(themeName);
    indicateThemeType(themeName);
    fix_superhero_navbar(themeName);

    localStorage.setItem(PM_COLOR_THEME, themeName);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 1500);

    console.debug('setCssTheme() - exit');
}


function bindEventHandlersCssTheme()
{
    $('.pm-onclick-set-css-theme').on('click', event => setCssTheme($(event.target).attr('data-pm-theme-name')));
}


export { setCssTheme, bindEventHandlersCssTheme };
