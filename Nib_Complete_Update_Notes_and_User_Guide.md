# Nib — Consolidated Update Notes, Fix History & User Guide

**Document date:** 5 November 2026  
**Project:** Nib / Nib Island (Windows 11, Electron; historical v0.3.6)  
**Document scope:** Consolidates all 16 supplied memo files, plus the additional `NIB_FEATURES_README.txt` available alongside them. This is documentation of changes attempted in different source versions, **not** a claim that they are all present or tested in a single installed build.

> **Read first:** The supplied notes span multiple experimental patches. They sometimes contradict one another because features were replaced. The *current intended experience* described below follows the latest documented direction: native Windows Snipping Tool for OCR, automatic clipboard import, transparent desktop overlay for Live Draw, and an automatically folding Nib notch. Actual behavior depends on which source ZIP was installed. Most updates were syntax-checked only; Windows runtime and installer testing were not confirmed.

## 1. What Nib is

Nib is an Electron desktop companion for Windows 11, shown as a small island/notch on the desktop. Its feature set described in the memos includes widgets and launchers, system monitoring, audio recording, clipboard tools, screen OCR, a live color picker, live drawing, media controls, and optional Claude Code integration. This note is both a consolidated change log and a user-oriented guide for the features documented in those memos.

## 2. Summary of updates and fixes

| Area | Changes recorded in the memos | Status / caveat |
|---|---|---|
| Notch stability | Auto-fold in hover mode, fallback pointer-leave detection, focus/click-through hysteresis, updated hitboxes, in-place recovery that should not force-pin the notch | Experimental; earlier conversations reported persistent stuck-hover/stuck-open behavior. Not verified fixed on Windows |
| Menu and layout | Cleaner Settings / Update / Fold in / Quit menu; widget ordering via drag handles or up/down controls; customizable profiles/themes | Menu and layout changed across patches; confirm in installed build |
| OCR | Multiple approaches tried: internal fullscreen selector, windowed screenshot crop, manual selection layer, native Windows Snipping Tool, automatic clipboard import, Windows PowerShell clipboard watcher | **Use native Windows snip + auto import as the intended latest workflow**; earlier Electron clipboard approaches failed; helper/Tesseract needed |
| OCR window | Temporarily minimizes during screenshot selection and returns once screenshot is copied, before recognition; timeout/error restoration | Windows runtime unverified |
| Live Draw | Restored transparent desktop drawing overlay with Undo, Clear, color and Exit/Esc | This supersedes the older screenshot-annotation-only drawing workflow |
| Screen tools | Separate window for OCR; independent live HEX picker; one window per tool in an earlier design; local error logging | Some older design notes describe different window behavior |
| Voice memo | Select input mic/output speakers, record and stop, in-app playback, Save As export; recordings kept in app data; microphone audio-processing constraints and shorter chunks | Playback and audio quality unverified on Windows; static/silence possible if wrong device/settings |
| GPU stats | GPU temperature, usage, VRAM, power, fan; selectable system metrics; GPU temperature in resting notch | NVIDIA `nvidia-smi` backend; other GPU brands not supported by that backend |
| General features | Widget order, Clipboard deletion/export, Discord mute/deafen keybinds, media controls, greetings, profile presets, light/dark themes, launcher, optional Phone Link launcher in an early patch | Not all features independently tested; Phone Link **notifications are not implemented** |
| Installation / packaging | Source ZIP replacement; `npm start`; build with `npm run dist`; optional bundled Tesseract via `resources/tesseract` | Supplied ZIPs are source, not prebuilt installers; Windows installer untested |

## 3. Getting started (developer / local source install)

**Requirements:** Windows 11; Node.js and npm for source builds; Electron dependencies already installed or installable; Windows PowerShell 5.1 for the clipboard-helper OCR variants; Tesseract for OCR (see §6).

1. Quit Nib completely through its Windows system tray icon. Closing only the notch window may leave Nib running.
2. Back up the entire Nib source folder **before replacing files**. Do not delete Nib's application data: your settings and voice recordings are stored separately.
3. Extract **one coherent source release** into your project folder. Do **not** mix random old patch files from different ZIPs.
4. Make sure all referenced helper files are present, including `ocr-clipboard.ps1` for Windows clipboard-based OCR and `live-draw.html` for restored desktop drawing, if your selected source uses them.
5. In a terminal opened in the project directory, run:

   ```cmd
   npm install
   npm start
   ```

   If dependencies were already installed and unchanged, `npm start` may be sufficient.
6. For a distributable build, run:

   ```cmd
   npm run dist
   ```

   Packaging Tesseract with the installer requires the complete OCR distribution at build time; see §6. **Do not assume a resulting installer is production-ready without clean-machine testing.**

**Example project folder from your development setup:** `D:\rbd\ai stuff\claude made\test\Nib-source\Nib-source`.

## 4. Everyday user guide

### 4.1 Open, fold and customize the notch

- Move the pointer over the resting island to expand it when **Hover** is selected in settings. Moving the pointer away is intended to fold it automatically.
- If your profile uses click-to-open or pin/lock settings, folding may behave differently.
- The cleaned menu is intended to show **Settings**, **Check for updates**, **Fold in**, and **Quit**. **Quit** fully exits Nib; **Fold in** just collapses the panel.
- Use **Settings** to configure enabled widgets, widget ordering, themes/profiles, island style and system-monitoring metrics as supported by your build.
- **Known issue:** historical builds could become stuck open, stuck closed, or unclickable after captures/fullscreen changes. The memos describe mitigation, not a verified cure.

### 4.2 Text OCR — recommended simplified workflow

**Goal:** select text visible anywhere on screen, import its screenshot locally, recognize it, then copy the text.

1. Open **Nib → Screen tools → Text OCR**.
2. Click **Select area**.
3. Windows' built-in Snipping Tool selection interface should appear. Drag across the target area.
4. When Windows copies the image to the clipboard, Nib should import the image, show a preview, and automatically run Tesseract.
5. Review/edit the recognized text and click **Copy text**.

**Alternative methods:**
- Press **Win + Shift + S** to capture with Windows manually, then choose **Import screenshot** / **Read clipboard** in Nib (label varies by version).
- Click **Open image** to OCR an existing PNG or JPG file.

**Important behavior:** The OCR window is intended to minimize *only while you select the screenshot*, then return as soon as the screenshot is detected (before slow OCR recognition). A timeout/cancel/error path should restore it. One earlier note specifies a 30-second selection timeout; another patch used a 15-second restoration timer—these refer to different iterations, not a guaranteed single current value.

**What OCR is not:** It does not require Nib to upload your screenshot to a cloud service; the documented OCR path is local/offline. The word “import” means bringing the Windows clipboard image into the Nib OCR window.

### 4.3 Live Draw — restored original desktop overlay

1. Open **Nib → Screen tools → Draw**.
2. Nib opens a transparent overlay on the desktop so you can draw over the content you are currently viewing.
3. Use the toolbar to change the pen **color**, **Undo** the last stroke, or **Clear** all strokes.
4. Choose **Exit**, press **Esc**, or use **Alt + F4** to return to normal desktop interaction.

The drawing overlay necessarily captures mouse input while active. These drawings are temporary marks over the desktop; they do not alter the underlying windows or save automatically. An **older, superseded edition** offered drawing on a captured screenshot with **Save annotated PNG** instead. That is different from Live Draw.

The Live Draw memo says the overlay opens on the monitor containing the cursor in multi-monitor setups. That behavior has not been Windows runtime tested.

### 4.4 Live HEX / color picker

Open the **Pick HEX** / color-picker screen tool. The documented floating picker samples the real screen pixel at the cursor via Windows GDI, without freezing the desktop. Use **Copy** to capture the HEX color code. It runs independently of the OCR and Draw windows.

### 4.5 Voice memos

1. Open **Voice memo**.
2. Choose the correct **microphone input** and **speaker output** (or system defaults).
3. Record a short test message, then press **Stop**.
4. Use **Play** for in-app playback, **Stop** to end playback, and **Save As** to export an audio file where you choose.
5. Existing recordings are saved under Nib's Electron application-data directory in a `voice-memos` subfolder; exporting a copy does not mean the originals were moved.

The memos refer to WebM recording, microphone noise suppression, echo cancellation, automatic gain control, and shorter recording chunks. These settings may help some microphones but cannot guarantee clean sound. If a recording sounds like static or silence, choose the correct input device, check Windows microphone permissions, test Windows' own microphone recorder, and use **Save As** to verify whether the underlying recording file plays outside Nib. Existing recordings may not become playable solely because the playback interface changed.

### 4.6 GPU / system monitoring

Go to **Settings → System** to choose metrics displayed by the system widget or resting notch (depending on build). Documented NVIDIA metrics include GPU temperature, utilization, VRAM used/total, power, power limit and fan speed. The resting notch may display `GPU 54°C`, for example.

GPU telemetry uses the NVIDIA `nvidia-smi` command asynchronously, documented as polling every four seconds. If the command or the metric isn't available, Nib should show **Not available** rather than invent a value. This backend does not directly support AMD/Intel GPUs.

### 4.7 Other documented features

- **Apps and widgets:** enable, reorder and launch pinned apps/widgets; some patches added drag handles and move-up/down controls.
- **Clipboard:** history, selection, deletion and export were part of the experimental feature set.
- **Media:** Spotify/other now-playing controls and browser media controls (including possible YouTube control). The browser controls operate at browser/media-session level, so they may affect non-YouTube tabs; exact-tab targeting was not implemented.
- **Discord:** configure mute/deafen keybinds.
- **Greetings and appearance:** time-of-day greeting, profiles and themes were introduced; early light-theme contrast limitations were noted.
- **Claude Code:** optional link and permission-prompt behavior; after connecting/disconnecting hooks, restart existing Claude Code sessions as instructed by the original tool.
- **Phone Link:** an early feature pack documented a launcher only. Another patch removed that tile. **Phone notification synchronization is not implemented** and would need a permissioned, paired companion integration.
- **Check for updates:** the Electron updater is intended for packaged builds with published releases. It is not equivalent to live updating a source checkout running through `npm start`.

## 5. Historical screen-tools evolution (why the old notes differ)

The supplied documentation captures distinct, overlapping development phases:

1. **Early feature pack:** OCR through Tesseract CLI; fullscreen drawing; basic voice recording and color picking. Tesseract must be on PATH.
2. **Screen Tools — Windowed Edition:** OCR and drawing in separate, resizable windows; screenshot selection inside a preview; drawing on screenshot with annotated PNG export. These are **historical**, not the final requested Live Draw experience.
3. **Manual Region Capture:** temporary fullscreen selector to crop the desktop after Electron captures it. This was reported to cause lag/freezing and was later replaced for OCR.
4. **Easy Windows OCR:** Windows Snipping Tool used to capture; manual Paste/Extract workflow in an earlier version.
5. **One-click / Native OCR:** automatically import clipboard screenshot and run Tesseract; manual **Import screenshot** and **Open image** fallbacks.
6. **Clipboard repair:** duplicate Electron `clipboard.readImage` implementation caused errors such as `clipboard.readImage is not a function` and `Electron main-process image clipboard is unavailable`; a Windows PowerShell STA clipboard watcher and `ocr-clipboard.ps1` were introduced instead.
7. **Window restoration:** OCR window temporarily minimizes while snipping and should return on detection, timeout or failure.
8. **Live Draw restored:** drawing returns to a transparent desktop overlay; screenshot-only annotation is no longer the preferred drawing workflow.

**Do not combine all these capture engines into one application.** They describe replacements over time, and mixing them was a source of conflicting handlers and regressions.

## 6. OCR engine, dependencies and installer bundling

OCR uses **Tesseract**, which needs both an executable and language data (plus DLLs where required).

### Development machine

Possible configurations documented in the memos:
- Install Tesseract system-wide and make `tesseract` available on `PATH` (check with `tesseract --version`).
- Put a **complete** Tesseract distribution in `resources\tesseract` (executable, required DLLs, `tessdata`, language files, licenses).
- For the bundling workflow, set `NIB_TESSERACT_DIR` to the full distribution location if the associated build script supports it.

The documentation mentions English traineddata as the starting language. Other languages need corresponding traineddata and configuration; this is not a guarantee that any selected source release includes them.

### Build for end users

1. On the Windows build machine, supply the complete Tesseract distribution.
2. Run `npm install` and `npm run dist`.
3. In the bundling-enabled edition, a prebuild step copies Tesseract to `resources\tesseract` and Electron Builder packages it as `extraResources` alongside `app.asar`.
4. Test the produced installer on a *clean Windows PC without Tesseract installed* to confirm truly offline, no-separate-install OCR.

**Critical qualification:** The source archives described by the memos do **not** include the Windows Tesseract executable, DLLs or traineddata. The “users install just Nib-Setup.exe” promise applies only **after** those resources have been successfully bundled and the installer has been tested. Include Tesseract/Leptonica/dependency copyright and licensing notices when redistributing.

### Windows Snipping Tool and clipboard helper

- The current intended OCR workflow requires Windows Snipping Tool to place the captured image on the clipboard.
- The Windows clipboard helper edition requires **Windows PowerShell 5.1** and the file `ocr-clipboard.ps1` beside `main.js`.
- `ms-screenclip:` launch behavior may vary by system; **Win + Shift + S** is the manual fallback.
- Screen captures are handled locally; source notes do not document any cloud upload.

## 7. Troubleshooting

| Symptom | Suggested check based on the memos |
|---|---|
| Select area does nothing | Try **Win + Shift + S** manually; verify Windows Snipping Tool works and copies images to the clipboard |
| OCR cannot import a screenshot | Check `ocr-clipboard.ps1` is present in the correct source folder and the intended version does **not** still contain a duplicate `clipboard.readImage` handler |
| OCR window disappears | Look for a capture timeout/failure; the window restoration patch is supposed to minimize temporarily and reopen before OCR completes |
| OCR has no recognized text | Test **Open image** with a clear PNG; verify Tesseract executable, `tessdata`, language files and `tesseract --version` |
| OCR causes graphics warnings or freezes | Earlier versions used Electron desktop capture and produced Windows DXGI initialization warnings; the native Snipping Tool workflow is intended to bypass that code path for OCR, but warnings alone do not establish the freeze cause |
| Notch stuck open/closed | Confirm Hover vs Click behavior and pinned/lock state; check that a legacy recovery handler is not forcing a pinned state; note this was not conclusively resolved in the supplied memos |
| Voice memo is static, silent or won't play | Verify selected microphone and Windows permissions; record a short test; export via Save As and test the file outside Nib; check speaker selection |
| GPU metrics unavailable | Verify NVIDIA driver and `nvidia-smi`; AMD/Intel are not supported by the documented NVIDIA-only metric backend |
| Live Draw intercepts desktop clicks | Expected during overlay drawing; use **Exit**, **Esc**, or **Alt + F4** |
| Unexpected app errors | Check the Electron application-data folder for `nib-errors.log`; this log is diagnostic, not an automatic repair mechanism |
| Update button does not install a release | Check whether Nib is a packaged build with a published update; source mode `npm start` has no automatic installed release to apply |

## 8. Known limitations and verification status

- **Most builds were source-only and syntax-validated, not tested on a live Windows 11 desktop.** JavaScript syntax checks do not verify Electron focus behavior, clipboard capture, audio devices, screen overlays, driver compatibility or installer integrity.
- The supplied memos record **attempted improvements**, not a confirmed “everything fixed” release. Persistent stuck-notch, OCR integration and voice-memo reports occurred during iteration.
- Windows GPU/driver resets and exclusive fullscreen behavior may affect desktop capture and transparent overlays; no universal fix is demonstrated by the notes.
- Multi-display behavior varied by implementation: an older capture system used the primary display; the restored Live Draw overlay says it chooses the display under the cursor.
- Windows screenshot permissions, clipboard configuration, Tesseract availability and microphone permissions are environment-specific.
- No genuine phone-notification sync is present.
- Tesseract redistribution is conditional on including the actual native distribution and its required license notices.

## 9. Recommended validation checklist before shipping

These are **recommended tests**, not claims that they have passed:

- [ ] Notch expands on hover, responds to clicks and auto-folds after pointer leaves.
- [ ] Notch remains usable after entering/leaving a fullscreen game.
- [ ] Settings, widgets, launcher and four-item menu work.
- [ ] OCR **Select area** opens Windows snip, imports the image, restores its window, extracts text and copies output.
- [ ] OCR survives screenshot cancellation, clipboard-empty conditions and missing Tesseract.
- [ ] OCR **Open image** works on a clear sample PNG/JPG.
- [ ] Live Draw overlay supports color, Undo, Clear, Exit and Esc; desktop is interactive afterward.
- [ ] Live HEX picker samples and copies a color.
- [ ] Voice memo input/output selection, recording, playback, Stop and Save As work with actual devices.
- [ ] GPU telemetry displays real metrics or Not available safely.
- [ ] Packaged installer runs offline with bundled Tesseract on a clean Windows system.
- [ ] Crash/error log captures problems without retaining unintended sensitive content.

## 10. Source memo inventory

All uploaded memo content has been incorporated above; the following files are the source record. An extra historical feature memo found alongside the uploads is also included.

| Memo filename | Main subject |
|---|---|
| `SCREEN_TOOLS_UPDATE.txt` | Windowed OCR/drawing, screenshot preview, diagnostics, limitations |
| `VOICE_README.txt` | Voice-memo device selectors, playback, Save As |
| `WINDOW_RESTORE_README.txt` | Minimize/restore during snipping |
| `EASY_OCR_README.txt` | Windows Snipping Tool + manual extraction iteration |
| `FIXES_README.txt` | Stability/layout fixes, recording location, Phone Link absence |
| `GPU_MONITOR_README.txt` | NVIDIA GPU stats backend and polling |
| `INSTALL_AND_LIMITATIONS.txt` | Source installation, Tesseract, color picker, technical limits |
| `LIVE_DRAW_README.txt` | Restored transparent Live Draw overlay |
| `NATIVE_OCR_README.txt` | Auto-import screenshot and OCR |
| `OCR_FIX_NOTES.txt` | Duplicate clipboard handler removal and PowerShell watcher |
| `OCR_QUICK_START.txt` | PowerShell clipboard OCR instructions |
| `OCR_README.txt` | One-click OCR and Tesseract prerequisite |
| `README_OCR_BUNDLING.txt` | Bundled Tesseract build and licensing |
| `README_RESTORED.txt` | Consolidated notch/voice recovery work |
| `README_UPDATE.txt` | Early experimental features and limitations |
| `REGION_CAPTURE_README.txt` | Older fullscreen region selector |
| `NIB_FEATURES_README.txt` *(additional available file)* | Earlier v0.3.6 feature pack overview |

---

**Documentation note:** This document records what the supplied memos state and reorganizes that information into a usable guide. It does not certify that any particular ZIP contains every described feature, or that the code has passed Windows integration tests.
