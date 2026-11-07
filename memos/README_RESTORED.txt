Nib consolidated restoration (source project)

Replace the complete application source with this folder after backing up your existing source. Keep your Nib userData folder: settings and recordings are stored there, not in this ZIP.

Changes: auto-fold in hover mode, pointer leave backup, focus handling and click-through hysteresis, post-animation hitboxes, repair never force-pins the notch, microphone DSP constraints and shorter MediaRecorder chunks. Existing menu stays at Settings / Update / Fold in / Quit.

OCR depends on Tesseract available in resources/tesseract or installed locally. The OCR engine and Windows runtime are not bundled/tested here.

Start: npm install (if needed), npm start. To test voice memo: select the correct microphone, record 5 seconds, stop, then play. Check Windows microphone permissions and input if silent/static.
