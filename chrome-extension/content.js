// Content script for Teams Member Adder
// This runs on teams.microsoft.com pages

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

    // Build candidate search queries (Lean & Fast: primary searchQuery first)
    const queriesToTry = [];
    if (searchQuery) queriesToTry.push(searchQuery);
    if (email && !queriesToTry.includes(email)) queriesToTry.push(email);

    // Fallback: If searchQuery had multiple words (e.g. middle names), try first name + surname
    const queryWords = (searchQuery || '').trim().split(/\s+/);
    if (queryWords.length > 2) {
        const shortQuery = `${queryWords[0]} ${queryWords[queryWords.length - 1]}`;
        if (!queriesToTry.includes(shortQuery)) queriesToTry.push(shortQuery);
    }

    let suggestion = null;

    for (const query of queriesToTry) {
        console.log(`[Teams Member Adder] Attempting search with: "${query}" (target email: ${email})`);
        await typeAndSearch(input, query);
        suggestion = findMatchingSuggestion(email, searchQuery);
        if (suggestion) {
            console.log(`[Teams Member Adder] Successfully matched suggestion using query: "${query}"`);
            break;
        }
    }

    if (suggestion) {
        suggestion.click();
        await sleep(500);
        return { success: true };
    } else {
        console.log(`[Teams Member Adder] Search returned no matching results for "${searchQuery}" (${email}).`);
        return {
            success: false,
            error: `No student found matching "${searchQuery}" (${email})`
        };
    }
}

async function typeAndSearch(input, query) {
    input.focus();
    await sleep(100);

    input.select();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);

    await sleep(100);

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
    ).set;
    nativeInputValueSetter.call(input, query);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    await sleep(2000);
}

function findMatchingSuggestion(email, searchQuery) {
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

    const isNoResultsText = (text) => {
        const lower = text.toLowerCase();
        return lower.includes("didn't find") ||
               lower.includes("no matches") ||
               lower.includes("no results") ||
               lower.includes("couldn't find") ||
               lower.includes("not found") ||
               lower.includes("no matching") ||
               lower.includes("can't find") ||
               lower.includes("0 results");
    };

    const normalizeAlpha = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const emailLower = (email || '').toLowerCase();
    const emailPrefix = emailLower.split('@')[0] || '';
    const emailNormalized = normalizeAlpha(emailPrefix);

    const queryLower = (searchQuery || '').toLowerCase();
    const queryNormalized = normalizeAlpha(searchQuery);

    const getTokens = (str) => (str || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2);
    const queryTokens = getTokens(searchQuery);
    const emailTokens = getTokens(emailPrefix);

    for (const selector of suggestionSelectors) {
        const items = document.querySelectorAll(selector);
        for (const item of items) {
            const rawText = item.textContent || '';
            const textLower = rawText.toLowerCase();

            // Skip elements displaying 'no results' messages
            if (isNoResultsText(textLower)) {
                continue;
            }

            const textNormalized = normalizeAlpha(rawText);

            // 1. Direct exact or substring match (Email or SearchQuery)
            if ((emailLower && textLower.includes(emailLower)) ||
                (emailPrefix && textLower.includes(emailPrefix)) ||
                (queryLower && textLower.includes(queryLower))) {
                console.log('[Teams Member Adder] Direct match suggestion:', rawText.trim().substring(0, 50));
                return item;
            }

            // 2. Alphanumeric normalized match (handles de.la.cruz vs delacruz, amba-an vs ambaan)
            if (emailNormalized.length >= 5 && textNormalized.includes(emailNormalized)) {
                console.log('[Teams Member Adder] Normalized email match suggestion:', rawText.trim().substring(0, 50));
                return item;
            }
            if (queryNormalized.length >= 5 && textNormalized.includes(queryNormalized)) {
                console.log('[Teams Member Adder] Normalized query match suggestion:', rawText.trim().substring(0, 50));
                return item;
            }

            // 3. Word Token Subset match (handles middle names inserted like HAZEL JOY ARAGON vs HAZEL ARAGON)
            if (queryTokens.length >= 2) {
                const allQueryTokensMatch = queryTokens.every(token => textLower.includes(token) || textNormalized.includes(token));
                if (allQueryTokensMatch) {
                    console.log('[Teams Member Adder] Token match suggestion (query tokens):', rawText.trim().substring(0, 50));
                    return item;
                }
            }

            // 4. First name + Surname token match (e.g. if middle names were present in query but missing in suggestion)
            if (queryTokens.length > 2) {
                const firstLastTokens = [queryTokens[0], queryTokens[queryTokens.length - 1]];
                const firstLastMatch = firstLastTokens.every(token => textLower.includes(token) || textNormalized.includes(token));
                if (firstLastMatch) {
                    console.log('[Teams Member Adder] First+Last token match suggestion:', rawText.trim().substring(0, 50));
                    return item;
                }
            }

            // 5. Email Token Subset match
            if (emailTokens.length >= 2) {
                const allEmailTokensMatch = emailTokens.every(token => textLower.includes(token) || textNormalized.includes(token));
                if (allEmailTokensMatch) {
                    console.log('[Teams Member Adder] Token match suggestion (email tokens):', rawText.trim().substring(0, 50));
                    return item;
                }
            }
        }
    }
    return null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Log that content script is loaded
console.log('[Teams Member Adder] Content script loaded - v1.5');
