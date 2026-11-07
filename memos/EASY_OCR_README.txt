Nib Easy Windows OCR

OCR: choose Screen tools -> Text OCR -> Capture area. Windows Snipping Tool appears. Drag a rectangle. Nib reads the resulting image from the clipboard, without its own full-screen overlay or Electron desktop capture. Click Extract selected text, then Copy text.

Backup paths: use Windows Win+Shift+S followed by Paste screenshot; or click Open image to recognize an existing PNG/JPG.

Draw still uses Nib original capture selector (unchanged). OCR requires Tesseract; install/copy existing Tesseract resources as before.

This is a source project, not a Windows executable. Copy files into existing Nib-source folder after backing up. npm start.

The change was syntax checked but not tested on Windows. Windows Snipping Tool may not open from ms-screenclip: on some installations; Win+Shift+S and Paste screenshot is the manual fallback.
