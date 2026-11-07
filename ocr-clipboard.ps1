param([Parameter(Mandatory=$true)][string]$OutputPath,[switch]$Wait)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NibClipboardSequence {
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
}
'@
$startSeq=[NibClipboardSequence]::GetClipboardSequenceNumber()
if ($Wait) { Write-Output 'READY'; [Console]::Out.Flush() }
$timer=[Diagnostics.Stopwatch]::StartNew()
do {
  if (-not $Wait -or [NibClipboardSequence]::GetClipboardSequenceNumber() -ne $startSeq) {
    try {
      $image=[Windows.Forms.Clipboard]::GetImage()
      if ($null -ne $image) {
        try { $image.Save($OutputPath,[Drawing.Imaging.ImageFormat]::Png) }
        finally { $image.Dispose() }
        Write-Output 'OK'
        exit 0
      }
    } catch { }
    if (-not $Wait) { break }
  }
  Start-Sleep -Milliseconds 250
} while ($timer.Elapsed.TotalSeconds -lt 55)
Write-Error 'No screenshot found. Press Win+Shift+S, select an area, then try Read clipboard.'
exit 2
