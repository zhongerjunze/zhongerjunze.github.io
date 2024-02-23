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

import { PM_SETTINGS_APITOKEN } from './globals.js'
import { GitLab } from './gitlab.js'
import { PagemarksSpi } from './spi.js'



function updateBodyClass(tokenPresent)
{
    const cl = document.body.classList;
    if (tokenPresent && !cl.contains('pm-token-present')) {
        cl.add('pm-token-present');
    }
    else if (!tokenPresent && cl.contains('pm-token-present')) {
        cl.remove('pm-token-present');
    }
}


function toggleRemoveButton(buttonEnabled)
{
    const cl = $('#settingsApiTokenModal div.modal-footer > button').first().prop('classList');
    if (buttonEnabled && cl.contains('disabled')) {
        cl.remove('disabled');
    }
    else if (!buttonEnabled && !cl.contains('disabled')) {
        cl.add('disabled');
    }
}


function updateApiTokenMenuItem(tokenPresent)
{
    const cl = $('#apiTokenMenuItem > i').last().prop('classList');
    if (tokenPresent) {
        cl.remove('bi-x');
        cl.remove('text-danger');
        cl.add('bi-check');
        cl.add('text-success');
    } else {
        cl.remove('bi-check');
        cl.remove('text-success');
        cl.add('bi-x');
        cl.add('text-danger');
    }
    cl.remove('invisible')
}


function isNotEmpty(token)
{
    return typeof(token) === 'string' && token.trim().length > 0;
}


/**
 * Update the input box status.
 * @param valid `true`: success, `false`: error, `undefined`: neutral
 */
function updateInputBoxStatus(valid)
{
    const inputBox = document.getElementById('apiTokenInput');
    const inputMsg = inputBox.nextSibling.nextSibling;   // jump over a text node
    const div = inputBox.parentElement;
    if (typeof(valid) !== 'boolean') {
        div.classList.remove('has-danger');
        div.classList.remove('has-success');
        inputBox.classList.remove('is-invalid');
        inputBox.classList.remove('is-valid');
        inputMsg.classList.remove('d-block');
        if (!inputMsg.classList.contains('d-none')) {
            inputMsg.classList.add('d-none');
        }
    }
    else if (valid) {
        div.classList.remove('has-danger');
        if (!div.classList.contains('has-success')) {
            div.classList.add('has-success');
        }
        inputBox.classList.remove('is-invalid');
        if (!inputBox.classList.contains('is-valid')) {
            inputBox.classList.add('is-valid');
        }
        inputMsg.classList.remove('d-block');
        if (!inputMsg.classList.contains('d-none')) {
            inputMsg.classList.add('d-none');
        }
    }
    else {
        div.classList.remove('has-success');
        if (!div.classList.contains('has-danger')) {
            div.classList.add('has-danger');
        }
        inputBox.classList.remove('is-valid');
        if (!inputBox.classList.contains('is-invalid')) {
            inputBox.classList.add('is-invalid');
        }
        inputMsg.classList.remove('d-none');
        if (!inputMsg.classList.contains('d-block')) {
            inputMsg.classList.add('d-block');
        }
    }
}


function toggleAlert(alertVisible)
{
    const cl = $('#apiTokenAlertRow').prop('classList');
    if (alertVisible) {
        cl.add('d-block');
        cl.remove('d-none');
    } else {
        cl.add('d-none');
        cl.remove('d-block');
    }
}


function modifyPage(tokenPresent, tokenValid)
{
    updateBodyClass(tokenValid);
    toggleRemoveButton(tokenPresent);
    updateApiTokenMenuItem(tokenValid);
    updateInputBoxStatus(tokenPresent ? tokenValid : undefined);
    if (tokenValid) {
        toggleAlert(false);
    }
}


function handleKeyPress(event)
{
    event.preventDefault();
    if (event.keyCode == 13 || event.which == 13) {
        // enter was pressed -> Okay button
        saveToken();
    }
    else if (event.keyCode == 27 || event.which == 27) {
        // escape was pressed -> Cancel button
        apiTokenCancel();
    }
    else {
        updateInputBoxStatus(undefined);
    }
}


function revealToken(revealed)
{
    if (revealed) {
        document.getElementById('apiTokenInput').type = 'text'
    } else {
        document.getElementById('apiTokenInput').type = 'password'
    }
}


function hideModal()
{
    $('#apiTokenInput').off('keyup');
    $('#settingsApiTokenModal').modal('hide');
}


function validateToken(token, closeModal, validCallback)
{
    const spi = new PagemarksSpi();
    spi.setImplementation(new GitLab());

    spi.validateToken(token,
        () => {  /* valid */
            modifyPage(true, true);
            if (validCallback) {
                validCallback();
            }
            if (closeModal) {
                hideModal();
            }
        },
        () => {  /* not valid, error */
            modifyPage(true, false);
            if (!closeModal) {
                toggleAlert(true);  // This is the 'init page' use case.
            }
        }
    );
}


function apiTokenInitPage()
{
    const token = localStorage.getItem(PM_SETTINGS_APITOKEN);
    if (isNotEmpty(token)) {
        validateToken(token, false);
    } else {
        modifyPage(false, false);
    }
}


function apiTokenShowModal()
{
    document.getElementById('apiTokenReveal').checked = false;
    revealToken(false);
    const token = localStorage.getItem(PM_SETTINGS_APITOKEN);
    const inputBox = $('#apiTokenInput');
    inputBox.val(typeof(token) === 'string' ? token.trim() : '');
    inputBox.keyup(handleKeyPress);
    $('#settingsApiTokenModal').modal('show');
}


function removeToken(askRUSure)
{
    if (!askRUSure || window.confirm('Really remove the token?')) {
        localStorage.removeItem(PM_SETTINGS_APITOKEN);
        modifyPage(false, false);
        hideModal();
    }
}


function saveToken()
{
    setTimeout(() => {
        // execute asynchronously so that we are guaranteed to get input field updates properly (think: bs, enter)
        const token = document.getElementById('apiTokenInput').value;
        if (isNotEmpty(token)) {
            validateToken(token, true,   // will hide the modal if token is valid
                () => localStorage.setItem(PM_SETTINGS_APITOKEN, token.trim()));
        } else {
            removeToken(false);  // will hide the modal
        }
    }, 0);
}


function apiTokenCancel()
{
    apiTokenInitPage();  // revalidate
    hideModal();
}


function apiTokenReveal()
{
    revealToken(document.getElementById('apiTokenReveal').checked);
}


function bindEventHandlersSettings()
{
    $('.pm-onclick-show-api-token-modal').on('click', apiTokenShowModal);
    $('.pm-onclick-api-token-reveal').on('click', apiTokenReveal);
    $('.pm-onclick-api-token-remove').on('click', () => removeToken(true));
    $('.pm-onclick-api-token-save').on('click', saveToken);
    $('.pm-onclick-api-token-cancel').on('click', apiTokenCancel);
}


export { apiTokenInitPage, bindEventHandlersSettings };
