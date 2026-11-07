Nib Native Snipping + Automatic Screenshot Import

1. Screen tools -> Text OCR -> Select area.
2. Windows built-in snipping UI opens. Drag to capture.
3. When Windows copies the new screenshot, Nib imports it, previews it, and runs Tesseract automatically.
4. Use Copy text.

Import screenshot also reads the current Windows image clipboard. Open image is a fallback.
Windows 11 and Tesseract OCR are required. The ZIP contains source; Tesseract binaries are not bundled.
No custom Electron screenshot overlay is invoked for OCR. Selection timeout: 30 seconds; then OCR UI returns.
The selected image is handled locally and is not sent to an online service.
Ensure Windows Snipping Tool clipboard copy is enabled.
Runtime not tested on Windows; JavaScript syntax validated.
