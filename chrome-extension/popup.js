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

    const failedSection = document.getElementById('failedSection');
    const failedCount = document.getElementById('failedCount');
    const failedList = document.getElementById('failedList');
    const copyFailedBtn = document.getElementById('copyFailedBtn');

    let isRunning = false;
    let isPaused = false;
    let stats = { total: 0, success: 0, error: 0 };
    let generatedEmails = [];
    let failedStudents = [];

    function clearFailedStudents() {
        failedStudents = [];
        if (failedList) failedList.innerHTML = '';
        if (failedSection) failedSection.style.display = 'none';
        if (failedCount) failedCount.textContent = '0';
    }

    function renderFailedStudents() {
        if (!failedSection || !failedList) return;

        if (failedStudents.length === 0) {
            failedSection.style.display = 'none';
            return;
        }

        failedSection.style.display = 'block';
        failedCount.textContent = failedStudents.length;
        failedList.innerHTML = '';

        failedStudents.forEach(item => {
            const div = document.createElement('div');
            div.className = 'failed-item';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'failed-item-name';
            nameDiv.textContent = item.student.searchQuery || item.student.email;

            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'failed-item-details';
            detailsDiv.textContent = item.student.email;

            const reasonDiv = document.createElement('div');
            reasonDiv.className = 'failed-item-reason';
            reasonDiv.textContent = `Reason: ${item.error}`;

            div.appendChild(nameDiv);
            div.appendChild(detailsDiv);
            div.appendChild(reasonDiv);

            failedList.appendChild(div);
        });
    }

    if (copyFailedBtn) {
        copyFailedBtn.addEventListener('click', () => {
            if (failedStudents.length === 0) return;
            const listText = failedStudents.map(item => `${item.student.searchQuery || item.student.email} (${item.student.email}) - ${item.error}`).join('\n');
            navigator.clipboard.writeText(listText).then(() => {
                const originalText = copyFailedBtn.textContent;
                copyFailedBtn.textContent = '✓ Copied!';
                setTimeout(() => {
                    copyFailedBtn.textContent = originalText;
                }, 2000);
            });
        });
    }

    function addLog(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        log.insertBefore(entry, log.firstChild);
    }
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

    // Clear button handling
    clearBtn.addEventListener('click', () => {
        emailsInput.value = '';
        chrome.storage.local.remove('emails');
        generatedEmails = [];
        fileInfo.textContent = '';
        fileInput.value = '';
        log.innerHTML = '';
        stats = { total: 0, success: 0, error: 0 };
        clearFailedStudents();
        updateStats();
        addLog('Cleared all data', 'info');
    });

    // Load saved data
    chrome.storage.local.get(['emails', 'delay']).then(result => {
        if (result.emails) emailsInput.value = result.emails;
        if (result.delay) delayInput.value = result.delay;
        updateStats();
    });

    // Save on change
    emailsInput.addEventListener('input', () => {
        chrome.storage.local.set({ emails: emailsInput.value });
        updateStats();
    });

    delayInput.addEventListener('change', () => {
        chrome.storage.local.set({ delay: delayInput.value });
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
                addLog(`Sample: ${generatedEmails[0].searchQuery} (${generatedEmails[0].email})`, 'info');
                if (generatedEmails.length > 1) {
                    addLog(`Sample: ${generatedEmails[1].searchQuery} (${generatedEmails[1].email})`, 'info');
                }
            }
        };

        reader.readAsText(file);
    }

    function parseHTMLMasterlist(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const rows = doc.querySelectorAll('tr');
        const students = [];

        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 1) {
                const name = cells[0].textContent.trim();
                const result = generateEmailFromName(name);
                if (result) {
                    students.push(result);
                }
            }
        }

        return students;
    }

    function parseCSV(content) {
        const lines = content.split('\n');
        const students = [];

        for (const line of lines) {
            // Check if line contains an email
            const match = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (match) {
                // If it's just a raw email list, use email for both
                students.push({
                    email: match[1].toLowerCase(),
                    searchQuery: match[1].toLowerCase()
                });
            }
        }

        return students;
    }

    function generateEmailFromName(fullName) {
        // Handle HTML entities
        fullName = fullName.replace(/&#209;/g, 'Ñ').replace(/&amp;#209;/g, 'Ñ');

        if (!fullName.includes(',')) return null;

        const parts = fullName.split(',');
        const surname = parts[0].trim();
        const givenNames = parts[1] ? parts[1].trim().split(/\s+/) : [];

        if (givenNames.length === 0) return null;

        // Primary method: In UNO-R masterlists (SURNAME, GIVEN_NAMES MOTHER_MAIDEN_SURNAME),
        // drop the Mother's Maiden Surname (last word of givenNames if > 1 words)
        let emailGivenNames;
        if (givenNames.length > 1) {
            emailGivenNames = givenNames.slice(0, -1);
        } else {
            emailGivenNames = givenNames;
        }

        // Normalize names for email
        const normalize = (name) => {
            return name.toLowerCase()
                .replace(/ñ/gi, 'n')
                .replace(/[^a-z\s]/g, '')
                .trim();
        };

        const givenNormalized = emailGivenNames.map(normalize).filter(n => n.length > 0);
        
        // Handle compound surnames (e.g. DE LA CRUZ -> de.la.cruz)
        const surnameWords = surname.split(/\s+/).map(normalize).filter(n => n.length > 0);
        const surnameDotted = surnameWords.join('.');

        // Primary email: e.g. jeff.daniel.aujero@student.uno-r.edu.ph
        const email = [...givenNormalized, surnameDotted].join('.') + '@student.uno-r.edu.ph';

        // Primary searchQuery: e.g. "JEFF DANIEL AUJERO"
        const searchQuery = `${emailGivenNames.join(' ')} ${surname}`;

        return { email, searchQuery };
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
            .filter(e => e.length > 0 && e.includes('@'))
            .map(e => ({ email: e, searchQuery: e })); // Default search query is email for pasted list
    }

    function updateStats() {
        const students = getCurrentEmails();
        stats.total = students.length;
        totalCount.textContent = stats.total;
        successCount.textContent = stats.success;
        errorCount.textContent = stats.error;
    }

    startBtn.addEventListener('click', async () => {
        if (isRunning) return;

        const students = getCurrentEmails();
        if (students.length === 0) {
            addLog('No valid emails found. Upload a file or paste emails.', 'error');
            return;
        }

        isRunning = true;
        isPaused = false;
        clearFailedStudents();
        stats = { total: students.length, success: 0, error: 0 };
        updateStats();

        startBtn.disabled = true;
        pauseBtn.disabled = false;

        addLog(`Starting to add ${students.length} members...`, 'info');

        // Find the Teams tab (not the current extension tab)
        const allTabs = await chrome.tabs.query({});
        const teamsTab = allTabs.find(t => t.url && (t.url.includes('teams.microsoft.com') || t.url.includes('teams.cloud.microsoft')));

        if (!teamsTab) {
            addLog('Please open Microsoft Teams in another tab first!', 'error');
            isRunning = false;
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            return;
        }

        const delay = parseInt(delayInput.value) || 2000;

        for (let i = 0; i < students.length; i++) {
            if (!isRunning) break;

            while (isPaused) {
                await new Promise(r => setTimeout(r, 500));
                if (!isRunning) break;
            }

            if (!isRunning) break;

            const student = students[i];
            addLog(`[${i + 1}/${students.length}] Adding: ${student.searchQuery} (${student.email})`, 'info');

            try {
                const response = await chrome.tabs.sendMessage(teamsTab.id, {
                    action: 'addMember',
                    email: student.email,
                    searchQuery: student.searchQuery
                });

                if (response && response.success) {
                    stats.success++;
                    addLog(`✓ Added: ${student.email}`, 'success');
                } else {
                    stats.error++;
                    const err = response?.error || 'Unknown error';
                    failedStudents.push({ student, error: err });
                    addLog(`✗ Failed: ${student.email} - ${err}`, 'error');
                }
            } catch (error) {
                stats.error++;
                let errorMsg = error.message;
                if (errorMsg.includes('Could not establish connection')) {
                    errorMsg = 'Connection lost. Please REFRESH the Teams tab and try again.';
                }
                failedStudents.push({ student, error: errorMsg });
                addLog(`✗ Error: ${student.email} - ${errorMsg}`, 'error');
            }

            updateStats();

            if (i < students.length - 1) {
                await new Promise(r => setTimeout(r, delay));
            }
        }

        isRunning = false;
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        addLog(`Completed! ${stats.success} added, ${stats.error} errors.`, 'info');
        renderFailedStudents();
    });

    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
        addLog(isPaused ? 'Paused' : 'Resumed', 'warning');
    });
});

