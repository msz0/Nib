# Nib 0.3.8 — source patch

Changes applied against the uploaded `nib.zip` source:

1. OCR: checks for the external `resources/ocr-clipboard.ps1` before invoking PowerShell; reports a clear packaging error when missing. `package.json` already bundles the helper via `extraResources`, and its packaged path resolves via `process.resourcesPath`. **Install the newly built version**: the currently installed v0.3.7 app will not change automatically.
2. Live Color: HEX copy now validates the actual Windows clipboard after writing, and the UI shows errors instead of falsely showing "Copied!". Sampling pauses briefly when copying.
3. Custom profiles: Save current widget configuration, ordering, theme, accent and island display settings. Load, rename, and delete saved profiles under Settings → Island. Profiles persist through Nib settings.
4. Light appearance: The notch background and gradient now honor the same see-through opacity variable as dark mode.
5. Resting eyes: "Nothing" on the left no longer substitutes a greeting. The greeting option still applies to other greeting UI.
6. Click mode: Clicking the resting notch opens it; after the native mouse pointer leaves the expanded notch it auto-folds (unless you're typing/dragging).
7. Accent: Custom HEX theme color editor under Settings → Island, saved through settings. Reset to default is available.

## Installation

Extract the archive to your current Nib project (backup first), replacing the existing sources. In PowerShell, from the project root:

```powershell
npm install
npm run dist
```

Close any running Nib process and install the newly created `dist\Nib-Setup.exe`.

## Important limitations

Static JavaScript syntax checks passed. Native Windows Electron runtime behavior, GDI clipboard behavior, installer packaging and installed OCR **were not tested** in this environment. This patch does not ship a prebuilt EXE. For OCR to work in the installer, the build PC needs a complete Tesseract distribution and the PowerShell OCR helper under packaged resources.
