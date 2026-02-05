// Background script - opens popup in a new tab instead of popup panel
// This avoids the Firefox limitation where file dialogs close the popup
// Ported to Chrome Manifest V3 Service Worker

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({
        url: chrome.runtime.getURL('popup.html')
    });
});
