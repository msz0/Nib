NIB — OCR included in your installer (Windows)

END USERS: They install Nib-Setup.exe only. No Tesseract download, no PATH setup, no admin permissions for OCR. OCR is offline.

BUILDER (YOU):
1. Install Tesseract on your build/development computer, e.g. UB Mannheim Windows build, including English traineddata.
   OR place a complete portable distribution inside resources/tesseract/ (exe, DLLs, tessdata).
   OR set NIB_TESSERACT_DIR to the complete Tesseract distribution location.
2. Run npm install (if not already done).
3. Run npm run dist.
   The new pre-build step copies Tesseract from the build computer into resources/tesseract.
   Electron Builder includes that folder as extraResources alongside app.asar.
4. Install dist/Nib-Setup.exe on a clean Windows machine with no Tesseract installed, confirm OCR works offline.

NOTE: This archive does NOT contain proprietary Windows-built Tesseract binary files, DLLs, or traineddata. The developer must supply them once at build time. The build refuses to package without a complete OCR distribution. Users will not have to install them themselves.

Licensing: Tesseract is Apache 2.0; its binary distribution can have additional licenses (Leptonica, image/graphics libraries, traineddata). Include relevant copyright and license files for everything redistributed.

This package is based on your last Nib_GPU_Monitor_Update.zip, preserving the last features. It is a source project, not a prebuilt Nib-Setup.exe.
