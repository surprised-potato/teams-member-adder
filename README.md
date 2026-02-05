# Teams Member Adder - Firefox Extension

A Firefox extension to batch add members to Microsoft Teams from a masterlist file or email list.

## Installation

1. Open Firefox and go to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on..."
4. Navigate to this folder and select `manifest.json`

The extension icon will appear in your toolbar.

## Usage

### Option 1: Upload Masterlist (End-to-End)

1. **Open Microsoft Teams** in your browser (teams.microsoft.com)
2. Navigate to your Team → Click "..." → "Add member"
3. **Keep the "Add member" dialog open**
4. Click the extension icon
5. **Upload your XLS masterlist** (drag & drop or click to upload)
6. The extension will automatically generate emails from names
7. Click "Start Adding Members"

The extension understands the UNO-R masterlist format:
- `SURNAME, FIRSTNAME SECONDNAME MIDDLENAME`
- Generates: `firstname.secondname.surname@student.uno-r.edu.ph`
- Mother's maiden surname (last word) is excluded

### Option 2: Paste Email List

1. Click the "Paste Emails" tab
2. Paste your email list (one per line)
3. Click "Start Adding Members"

## Features

- **File upload**: Supports XLS/CSV masterlist files
- **Auto email generation**: Converts names to emails using UNO-R format
- **Pause/Resume**: Stop the process anytime and continue later
- **Progress tracking**: See how many members have been added
- **Activity log**: Track successes and errors
- **Configurable delay**: Adjust timing to avoid rate limits

## Troubleshooting

- **"Could not find input field"**: Make sure the "Add member" dialog is open in Teams
- **Members not being added**: Try increasing the delay to 3000ms or more
- **Extension not working**: Make sure you're on teams.microsoft.com
- **Wrong emails generated**: Check that names are in `SURNAME, FIRSTNAME MIDDLENAME` format

## Notes

- This extension only works on the Teams web app
- You must be an owner of the Team to add members
- The extension simulates user interactions, so it's subject to UI changes
