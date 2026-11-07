OCR window restoration patch
When selecting a screenshot, the OCR window is minimized temporarily, not hidden. It restores immediately after the screenshot is copied (before OCR begins), and also recovers on timeout or failure.
Close Nib completely before replacing files. Nib relies on the existing ocr-clipboard.ps1 PowerShell helper.
The Windows snipping workflow has not been runtime tested on Windows in this environment.
