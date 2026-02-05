// Background script - opens popup in a new tab instead of popup panel
// This avoids the Firefox limitation where file dialogs close the popup

browser.browserAction.onClicked.addListener(() => {
    browser.tabs.create({
        url: browser.runtime.getURL('popup.html')
    });
});
