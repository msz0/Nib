const { execFile } = require('child_process');

const TYPE = String.raw`
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int flow, int state, IntPtr devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
  [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
  [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr callback);
  [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr callback);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  [PreserveSig] int Activate(ref Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.Interface)] out IAudioSessionManager2 manager);
  [PreserveSig] int OpenPropertyStore(int access, IntPtr properties);
  [PreserveSig] int GetId(out IntPtr id);
  [PreserveSig] int GetState(out int state);
}
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
  [PreserveSig] int GetAudioSessionControl(ref Guid session, int flags, IntPtr control);
  [PreserveSig] int GetSimpleAudioVolume(ref Guid session, int flags, IntPtr volume);
  [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
  [PreserveSig] int RegisterSessionNotification(IntPtr notification);
  [PreserveSig] int UnregisterSessionNotification(IntPtr notification);
  [PreserveSig] int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr notification);
  [PreserveSig] int UnregisterDuckNotification(IntPtr notification);
}
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
  [PreserveSig] int GetCount(out int count);
  [PreserveSig] int GetSession(int index, out IAudioSessionControl session);
}
[ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl {
  [PreserveSig] int GetState(out int state);
  [PreserveSig] int GetDisplayName(out IntPtr name);
  [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
  [PreserveSig] int GetIconPath(out IntPtr path);
  [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
  [PreserveSig] int GetGroupingParam(out Guid grouping);
  [PreserveSig] int SetGroupingParam(ref Guid grouping, ref Guid context);
  [PreserveSig] int RegisterAudioSessionNotification(IntPtr notification);
  [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notification);
}
[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  [PreserveSig] int GetState(out int state);
  [PreserveSig] int GetDisplayName(out IntPtr name);
  [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
  [PreserveSig] int GetIconPath(out IntPtr path);
  [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
  [PreserveSig] int GetGroupingParam(out Guid grouping);
  [PreserveSig] int SetGroupingParam(ref Guid grouping, ref Guid context);
  [PreserveSig] int RegisterAudioSessionNotification(IntPtr notification);
  [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notification);
  [PreserveSig] int GetSessionIdentifier(out IntPtr id);
  [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
  [PreserveSig] int GetProcessId(out uint pid);
  [PreserveSig] int IsSystemSoundsSession();
  [PreserveSig] int SetDuckingPreference(bool optOut);
}
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
  [PreserveSig] int SetMasterVolume(float volume, ref Guid context);
  [PreserveSig] int GetMasterVolume(out float volume);
  [PreserveSig] int SetMute(bool mute, ref Guid context);
  [PreserveSig] int GetMute(out bool mute);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"), ClassInterface(ClassInterfaceType.None)]
class MMDeviceEnumerator {}

public static class NibAppVolume {
  static string AppName(string source) {
    string id = (source ?? "").ToLowerInvariant();
    if (id.Contains("spotify")) return "spotify";
    if (id.Contains("chrome") || id.Contains("googlechrome")) return "chrome";
    if (id.Contains("edge") || id.Contains("msedge")) return "msedge";
    if (id.Contains("firefox")) return "firefox";
    if (id.Contains("brave")) return "brave";
    if (id.Contains("opera")) return "opera";
    if (id.Contains("vivaldi")) return "vivaldi";
    Match match = Regex.Match(id, @"([a-z0-9_-]+)\.exe");
    return match.Success ? match.Groups[1].Value : "";
  }
  public static string Run(string action, string source, float value) {
    string name = AppName(source);
    if (name.Length == 0) return "{\"available\":false,\"error\":\"This media app could not be matched to a Windows audio session.\"}";
    IMMDeviceEnumerator devices = null;
    int matches = 0;
    float current = 0;
    Guid context = Guid.Empty;
    try {
      devices = (IMMDeviceEnumerator)new MMDeviceEnumerator();
      IMMDevice device;
      if (devices.GetDefaultAudioEndpoint(0, 0, out device) < 0) throw new Exception("Could not find the default audio output device.");
      IAudioSessionManager2 manager;
      Guid iid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
      int hr = device.Activate(ref iid, 23, IntPtr.Zero, out manager);
      if (hr < 0) throw new Exception("Could not activate Windows audio sessions (0x" + hr.ToString("X8") + ").");
      IAudioSessionEnumerator sessions;
      hr = manager.GetSessionEnumerator(out sessions);
      if (hr < 0) throw new Exception("Could not read Windows audio sessions (0x" + hr.ToString("X8") + ").");
      int sessionCount;
      hr = sessions.GetCount(out sessionCount);
      if (hr < 0) throw new Exception("Could not read Windows audio sessions (0x" + hr.ToString("X8") + ").");
      for (int j = 0; j < sessionCount; j++) {
        IAudioSessionControl session;
        if (sessions.GetSession(j, out session) < 0) continue;
        IAudioSessionControl2 session2 = session as IAudioSessionControl2;
        ISimpleAudioVolume volume = session as ISimpleAudioVolume;
        if (session2 == null || volume == null) continue;
        uint pid;
        if (session2.GetProcessId(out pid) < 0 || pid == 0) continue;
        string processName;
        try { processName = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); }
        catch { continue; }
        if (processName != name && !processName.StartsWith(name + ".", StringComparison.Ordinal)) continue;
        if (action == "set") {
          current = Math.Max(0, Math.Min(1, value));
          if (volume.SetMasterVolume(current, ref context) < 0) continue;
        } else {
          float found;
          if (volume.GetMasterVolume(out found) < 0) continue;
          current = found;
        }
        matches++;
      }
      if (matches == 0) return "{\"available\":false,\"error\":\"No active audio session was found for this app.\"}";
      return "{\"available\":true,\"volume\":" + current.ToString(System.Globalization.CultureInfo.InvariantCulture) + "}";
    } catch (Exception e) {
      string message = e.Message.Replace("\\", "\\\\").Replace("\"", "\\\"");
      return "{\"available\":false,\"error\":\"" + message + "\"}";
    } finally {
      if (devices != null) Marshal.ReleaseComObject(devices);
    }
  }
}`;

function run(action, sourceId, volume = 0) {
  if (process.platform !== 'win32') return Promise.resolve({ available: false, error: 'Per-app volume is available on Windows only.' });
  if (typeof sourceId !== 'string' || sourceId.length > 300) return Promise.resolve({ available: false, error: 'Invalid media app.' });
  const source = Buffer.from(sourceId, 'utf8').toString('base64');
  const type = Buffer.from(TYPE, 'utf8').toString('base64');
  const value = Number(volume);
  if (action === 'set' && (!Number.isFinite(value) || value < 0 || value > 1)) return Promise.resolve({ available: false, error: 'Invalid volume level.' });
  const script = `$ErrorActionPreference='Stop'; $type=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${type}')); Add-Type -TypeDefinition $type; $source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${source}')); [NibAppVolume]::Run('${action}',$source,${action === 'set' ? value : 0})`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, timeout: 8000, maxBuffer: 16384 }, (error, stdout, stderr) => {
    if (error) return resolve({ available: false, error: 'Could not access Windows audio sessions.' });
    try { resolve(JSON.parse(stdout.trim())); }
    catch { resolve({ available: false, error: 'Windows returned an invalid audio-session response.' }); }
  }));
}

module.exports = {
  get: sourceId => run('get', sourceId),
  set: (sourceId, volume) => run('set', sourceId, volume)
};
