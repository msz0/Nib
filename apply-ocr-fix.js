'use strict';
// Run in the root of the existing Nib project: node apply-ocr-fix.js
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const mainPath = path.join(root,'main.js');
const pkgPath = path.join(root,'package.json');
const helperPath = path.join(root,'ocr-clipboard.ps1');
const bundledHelper = path.join(__dirname,'ocr-clipboard.ps1');
if(!fs.existsSync(mainPath) || !fs.existsSync(pkgPath)) throw Error('Open terminal in your Nib project directory, where main.js and package.json live.');
const main = fs.readFileSync(mainPath,'utf8');
const old = "path.join(__dirname,'ocr-clipboard.ps1')";
const replacement = "path.join(app.isPackaged ? process.resourcesPath : __dirname, 'ocr-clipboard.ps1')";
if(!main.includes(old) && !main.includes(replacement)) throw Error('Could not find expected OCR script path in main.js. No changes made.');
const pkg = JSON.parse(fs.readFileSync(pkgPath,'utf8'));
if(!pkg.build || !Array.isArray(pkg.build.extraResources)) throw Error('Expected build.extraResources in package.json. No changes made.');
const already = pkg.build.extraResources.some(x=>typeof x==='object' && x.to==='ocr-clipboard.ps1');
if(!already) pkg.build.extraResources.push({from:'ocr-clipboard.ps1',to:'ocr-clipboard.ps1'});
// Verify everything before writing
if(!fs.existsSync(helperPath) && !fs.existsSync(bundledHelper)) throw Error('ocr-clipboard.ps1 missing. No changes made.');
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
fs.copyFileSync(mainPath,mainPath+'.backup-'+stamp);
fs.copyFileSync(pkgPath,pkgPath+'.backup-'+stamp);
if(!fs.existsSync(helperPath)) fs.copyFileSync(bundledHelper,helperPath);
if(main.includes(old)) fs.writeFileSync(mainPath,main.replaceAll(old,replacement),'utf8');
if(!already) fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n','utf8');
console.log('Installed OCR script path corrected; installer now copies ocr-clipboard.ps1 outside app.asar.');
console.log('Backups saved. Build locally with npm run dist (not npm run release).');
