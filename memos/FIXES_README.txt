Nib stability and layout hotfix (experimental)

1. Close Nib completely using tray > Quit.
2. Back up the project.
3. Replace the files from this archive in the Nib project root. Do not delete user data.
4. Run npm start; test Settings > Apps drag handles or up/down buttons, System metrics selections, launcher controls, and voice memos.

Voice recordings are saved inside Electron userData/voice-memos, not exported to a chosen file. Any saved data necessarily lives on your PC, but it is managed by Nib.
OCR requires Tesseract OCR installed and on PATH; check `tesseract --version` in PowerShell. Phone Link tile was removed; native phone notification sync was NOT implemented (needs an authenticated phone companion).

This package was syntax checked but not executed in Windows 11. Keep backup and do not distribute without testing.
