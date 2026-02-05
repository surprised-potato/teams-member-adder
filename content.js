// Content script for Teams Member Adder
// This runs on teams.microsoft.com pages

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'addMember') {
        addMember(message.email, message.searchQuery)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep the message channel open for async response
    }
});

async function addMember(email, searchQuery) {
    // If no specific search query provided, use email prefix
    if (!searchQuery) searchQuery = email.split('@')[0];

    // First, find the Add Member dialog/panel
    // We need to specifically target inputs INSIDE the dialog, not the main search bar

    // Look for the dialog/panel first
    const dialogSelectors = [
        '[role="dialog"]',
        '[data-tid="addMemberDialog"]',
        '[class*="dialog"]',
        '[class*="panel"]',
        '[class*="Dialog"]',
        '[class*="Panel"]',
        '[class*="flyout"]',
        '[class*="Flyout"]',
        // New Teams uses layered panels
        '[class*="layer"]',
        '[class*="modal"]',
        '[class*="Modal"]'
    ];

    let dialog = null;
    for (const selector of dialogSelectors) {
        const elements = document.querySelectorAll(selector);
        // Find the visible one (not hidden)
        for (const el of elements) {
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null) {
                // Check if it contains an input that looks like a people picker
                const hasInput = el.querySelector('input');
                if (hasInput) {
                    dialog = el;
                    break;
                }
            }
        }
        if (dialog) break;
    }

    // Now find the input within the dialog context, or fall back to specific selectors
    let input = null;

    // Priority 1: Input inside a detected dialog
    if (dialog) {
        const inputSelectors = [
            'input[data-tid="peoplePicker-input"]',
            'input[placeholder*="Add"]',
            'input[placeholder*="name"]',
            'input[placeholder*="email"]',
            'input[aria-label*="Add"]',
            'input[aria-label*="member"]',
            'input[aria-label*="name"]',
            'input[type="text"]',
            'input:not([type="hidden"])'
        ];

        for (const selector of inputSelectors) {
            input = dialog.querySelector(selector);
            if (input) {
                console.log('[Teams Member Adder] Found input in dialog:', selector);
                break;
            }
        }
    }

    // Priority 2: Look for people picker specifically (even outside dialog detection)
    if (!input) {
        const pickerSelectors = [
            'input[data-tid="peoplePicker-input"]',
            '[class*="peoplePicker"] input',
            '[class*="PeoplePicker"] input',
            '[class*="people-picker"] input',
            '.ms-BasePicker-input',
            // New Teams specific
            '[data-tid="add-member-input"]',
            '[data-tid="member-input"]'
        ];

        for (const selector of pickerSelectors) {
            input = document.querySelector(selector);
            if (input) {
                console.log('[Teams Member Adder] Found people picker input:', selector);
                break;
            }
        }
    }

    // Priority 3: Look for any input in a dialog role element
    if (!input) {
        const dialogInput = document.querySelector('[role="dialog"] input[type="text"]');
        if (dialogInput) {
            input = dialogInput;
            console.log('[Teams Member Adder] Found input in role=dialog');
        }
    }

    if (!input) {
        return {
            success: false,
            error: 'Could not find the Add Member input. Make sure the "Add member" dialog is open and visible.'
        };
    }

    // Clear existing text and focus
    input.focus();
    await sleep(100);

    // Select all and clear
    input.select();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);

    await sleep(100);

    // Communicate what we are searching for
    console.log(`[Teams Member Adder] Searching for: "${searchQuery}" (expected email: ${email})`);

    // Simulate typing (React-friendly)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
    ).set;
    nativeInputValueSetter.call(input, searchQuery);

    // Dispatch input event to trigger React's onChange
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Also try keyboard events for better React compatibility
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    // Wait for search results to appear
    await sleep(2000);

    // Look for the suggestion/result to click
    const suggestionSelectors = [
        '[data-tid="peoplepicker-dropdown-item"]',
        '[data-tid*="suggestion"]',
        '[role="option"]',
        '[role="listbox"] [role="option"]',
        '.ms-Suggestions-item',
        '[class*="suggestion"]',
        '[class*="Suggestion"]',
        '[class*="result"]',
        '[class*="Result"]',
        '[class*="dropdown"] [role="option"]'
    ];

    let suggestion = null;

    for (const selector of suggestionSelectors) {
        const items = document.querySelectorAll(selector);
        for (const item of items) {
            const text = item.textContent.toLowerCase();
            // Match logic:
            // 1. Exact email match (best)
            // 2. Email prefix match
            // 3. Name match (if searchQuery is in the result text)

            if (text.includes(email.toLowerCase()) ||
                text.includes(email.split('@')[0].toLowerCase()) ||
                text.includes(searchQuery.toLowerCase())) {

                suggestion = item;
                console.log('[Teams Member Adder] Found matching suggestion:', item.textContent.substring(0, 50));
                break;
            }
        }
        if (suggestion) break;
    }

    if (suggestion) {
        suggestion.click();
        await sleep(500);
        return { success: true };
    } else {
        // If no suggestion found, try pressing Enter
        console.log('[Teams Member Adder] No suggestion matched. Attempting Enter key...');
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
        }));

        await sleep(500);

        return {
            success: true,
            warning: 'No suggestion found, attempted Enter key'
        };
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Log that content script is loaded
console.log('[Teams Member Adder] Content script loaded - v1.2');
