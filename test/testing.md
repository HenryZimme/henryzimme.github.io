# Testing Protocol for GitHub Pages

Use the `testing` folder to safely preview website changes before promoting to production. Test files use suffixes like `_test.py`, `-test.js`, or `-test.html`.

## File Naming Rules

- Append `_test.py` for Python, `-test.js` for JavaScript, `-test.html` for markup
- Examples: `script_test.py`, `app-test.js`, `index-test.html`
- Delete/rename test files after validation to keep folder clean

## Testing Workflow

1. Clone repo, navigate to `testing` folder
2. Upload modified code as test files
3. Make sure files are referenced with /folder/filename.filetype
4. Commit/push to view at `https://henryzimmerman.net/test/`
5. Verify: console errors, responsiveness, links, features
6. Run local tests (e.g., `python filename_test.py`, `npm test`)
7. On success: Copy to root, remove test files, rename file references if necessary (remove test, test directory), commit ("Promote tested files"), push

## Validation Checklist

- Page loads (no 404s/broken assets)
- JS/Python logic correct (logs match)
- Responsive on mobile/desktop
- No console errors; interactions work
- Test in Chrome, Firefox, Safari

## Cleanup

- Run `git rm testing/*-test.*`, commit changes
- Use branches (e.g., `dev-testing`) for complex tests
- Keep this `testing.md` at folder root
