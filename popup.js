// Popup script for Teams Member Adder
// End-to-end: Upload masterlist → Generate emails → Add to Teams

document.addEventListener('DOMContentLoaded', () => {
    const emailsInput = document.getElementById('emails');
    const delayInput = document.getElementById('delay');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const clearBtn = document.getElementById('clearBtn');
    const totalCount = document.getElementById('totalCount');
    const successCount = document.getElementById('successCount');
    const errorCount = document.getElementById('errorCount');
    const log = document.getElementById('log');
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const tabs = document.querySelectorAll('.tab');

    let isRunning = false;
    let isPaused = false;
    let stats = { total: 0, success: 0, error: 0 };
    let generatedEmails = [];

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
            updateStats();
        });
    });

    // Load saved data
    browser.storage.local.get(['emails', 'delay']).then(result => {
        if (result.emails) emailsInput.value = result.emails;
        if (result.delay) delayInput.value = result.delay;
        updateStats();
    });

    // Save on change
    emailsInput.addEventListener('input', () => {
        browser.storage.local.set({ emails: emailsInput.value });
        updateStats();
    });

    delayInput.addEventListener('change', () => {
        browser.storage.local.set({ delay: delayInput.value });
    });

    // File upload handling
    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) processFile(file);
    });

    async function processFile(file) {
        addLog(`Processing file: ${file.name}`, 'info');

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;

            if (file.name.endsWith('.csv')) {
                generatedEmails = parseCSV(content);
            } else {
                // Assume HTML/XLS format (UNO-R exports XLS as HTML)
                generatedEmails = parseHTMLMasterlist(content);
            }

            fileInfo.textContent = `✓ Loaded ${generatedEmails.length} students`;
            addLog(`Generated ${generatedEmails.length} emails from masterlist`, 'success');
            updateStats();

            // Show first few for verification
            if (generatedEmails.length > 0) {
                addLog(`Sample: ${generatedEmails[0]}`, 'info');
                if (generatedEmails.length > 1) {
                    addLog(`Sample: ${generatedEmails[1]}`, 'info');
                }
            }
        };

        reader.readAsText(file);
    }

    function parseCSV(content) {
        const lines = content.split('\n');
        const emails = [];

        for (const line of lines) {
            // Check if line contains an email
            const match = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (match) {
                emails.push(match[1].toLowerCase());
            }
        }

        return emails;
    }

    function parseHTMLMasterlist(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const rows = doc.querySelectorAll('tr');
        const emails = [];

        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 1) {
                const name = cells[0].textContent.trim();
                const email = generateEmailFromName(name);
                if (email) {
                    emails.push(email);
                }
            }
        }

        return emails;
    }

    function generateEmailFromName(fullName) {
        // Handle HTML entities
        fullName = fullName.replace(/&#209;/g, 'Ñ').replace(/&amp;#209;/g, 'Ñ');

        if (!fullName.includes(',')) return null;

        const parts = fullName.split(',');
        const surname = parts[0].trim();
        const givenNames = parts[1] ? parts[1].trim().split(/\s+/) : [];

        if (givenNames.length === 0) return null;

        // Remove the last word (mother's maiden surname)
        let emailNames;
        if (givenNames.length > 1) {
            emailNames = givenNames.slice(0, -1);
        } else {
            emailNames = givenNames;
        }

        // Normalize names
        const normalize = (name) => {
            return name.toLowerCase()
                .replace(/ñ/gi, 'n')
                .replace(/[^a-z\s]/g, '')
                .trim();
        };

        const emailParts = emailNames.map(normalize).filter(n => n.length > 0);
        const surnameNormalized = normalize(surname).replace(/\s+/g, '');
        emailParts.push(surnameNormalized);

        return emailParts.join('.') + '@student.uno-r.edu.ph';
    }

    function getCurrentEmails() {
        const activeTab = document.querySelector('.tab.active').dataset.tab;

        if (activeTab === 'upload') {
            return generatedEmails;
        } else {
            return parseEmails(emailsInput.value);
        }
    }

    function parseEmails(text) {
        return text
            .split('\n')
            .map(e => e.trim())
            .filter(e => e.length > 0 && e.includes('@'));
    }

    function updateStats() {
        const emails = getCurrentEmails();
        stats.total = emails.length;
        totalCount.textContent = stats.total;
        successCount.textContent = stats.success;
        errorCount.textContent = stats.error;
    }

    function addLog(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        log.insertBefore(entry, log.firstChild);
    }

    clearBtn.addEventListener('click', () => {
        log.innerHTML = '';
        stats.success = 0;
        stats.error = 0;
        generatedEmails = [];
        fileInfo.textContent = '';
        updateStats();
    });

    startBtn.addEventListener('click', async () => {
        if (isRunning) return;

        const emails = getCurrentEmails();
        if (emails.length === 0) {
            addLog('No valid emails found. Upload a file or paste emails.', 'error');
            return;
        }

        isRunning = true;
        isPaused = false;
        startBtn.disabled = true;
        pauseBtn.disabled = false;

        addLog(`Starting to add ${emails.length} members...`, 'info');

        // Find the Teams tab (not the current extension tab)
        const allTabs = await browser.tabs.query({});
        const teamsTab = allTabs.find(t => t.url && t.url.includes('teams.microsoft.com'));

        if (!teamsTab) {
            addLog('Please open Microsoft Teams in another tab first!', 'error');
            isRunning = false;
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            return;
        }

        const delay = parseInt(delayInput.value) || 2000;

        for (let i = 0; i < emails.length; i++) {
            if (!isRunning) break;

            while (isPaused) {
                await new Promise(r => setTimeout(r, 500));
                if (!isRunning) break;
            }

            if (!isRunning) break;

            const email = emails[i];
            addLog(`[${i + 1}/${emails.length}] Adding: ${email}`, 'info');

            try {
                const response = await browser.tabs.sendMessage(teamsTab.id, {
                    action: 'addMember',
                    email: email
                });

                if (response && response.success) {
                    stats.success++;
                    addLog(`✓ Added: ${email}`, 'success');
                } else {
                    stats.error++;
                    addLog(`✗ Failed: ${email} - ${response?.error || 'Unknown error'}`, 'error');
                }
            } catch (error) {
                stats.error++;
                addLog(`✗ Error: ${email} - ${error.message}`, 'error');
            }

            updateStats();

            if (i < emails.length - 1) {
                await new Promise(r => setTimeout(r, delay));
            }
        }

        isRunning = false;
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        addLog(`Completed! ${stats.success} added, ${stats.error} errors.`, 'info');
    });

    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
        addLog(isPaused ? 'Paused' : 'Resumed', 'warning');
    });
});
