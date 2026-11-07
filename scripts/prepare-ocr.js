// Build-time bundler: users never have to install Tesseract separately.
// Copies the ENTIRE OCR distribution, including DLLs, tessdata and applicable notices.
'use strict';
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const dest=path.join(root,'resources','tesseract');
const candidates=[process.env.NIB_TESSERACT_DIR, 'C:\\Program Files\\Tesseract-OCR', 'C:\\Program Files (x86)\\Tesseract-OCR'].filter(Boolean);
const valid=dir=>dir && fs.existsSync(path.join(dir,'tesseract.exe')) && fs.existsSync(path.join(dir,'tessdata','eng.traineddata'));
if(!valid(dest)) {
  const source=candidates.find(valid);
  if(!source){
    console.error('\nOCR packaging is incomplete.\nInstall Tesseract ON THE BUILD COMPUTER ONLY (not your users\' computers), or set NIB_TESSERACT_DIR to a complete Tesseract distribution.\nThe build needs tesseract.exe, its DLLs, and tessdata/eng.traineddata.\n');
    process.exit(1);
  }
  fs.mkdirSync(dest,{recursive:true});
  fs.cpSync(source,dest,{recursive:true,force:true});
}
if (!valid(dest)) { console.error('Bundled Tesseract validation failed.'); process.exit(1); }
const dll=fs.readdirSync(dest).filter(f=>f.toLowerCase().endsWith('.dll'));
if (!dll.length) {console.error('Tesseract DLL dependencies missing; refusing to build incomplete OCR.');process.exit(1);}
console.log(`OCR bundled: ${dest} (${dll.length} DLLs, English language data).`);
console.log('Ensure applicable OCR binary and third-party license notices are included before distributing.');
