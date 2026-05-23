const fs = require('fs');
const os = require('os');

const platform = {};

// --- SO ---
platform.isWindows = process.platform === 'win32';
platform.isMac     = process.platform === 'darwin';
platform.isLinux   = process.platform === 'linux';

// --- ANDROID / TERMUX / PROOT ---
// ANDROID_ROOT e ANDROID_DATA são setados pelo Android e vazam dentro do proot
platform.isAndroid = !!process.env.ANDROID_ROOT;

// Kernel contém "PRoot" quando rodando via proot (ex: Termux)
platform.isProot = platform.isLinux && (
  os.release().includes('PRoot') ||
  os.release().includes('proot')
);

// Termux (via proot) é Android + proot
platform.isTermuxProot = platform.isAndroid && platform.isProot;

// --- ALSA / MIDI ---
platform.hasAlsaSeq = platform.isLinux && fs.existsSync('/dev/snd/seq');
platform.hasAlsa    = platform.isLinux && fs.existsSync('/dev/snd');

// MIDI nativo disponível? Requer ALSA (Linux), winmm (Windows), ou CoreMIDI (Mac)
platform.hasNativeMidi = platform.isWindows || platform.isMac || platform.hasAlsaSeq;

// --- SISTEMA DE ILUMINAÇÃO (DMX) ---
// DMX via ArtNetToDMX.exe + Lumikit é Windows-only (USB FTDI + PowerShell)
platform.supportsDmx = platform.isWindows;

// --- SYSTEM TRAY ---
// Systray2 é Windows-only
platform.supportsSystray = platform.isWindows;

// --- LOG ---
console.log(`🔍 [PLATFORM] Android:${platform.isAndroid} Proot:${platform.isProot} Termux:${platform.isTermuxProot}`);
console.log(`🔍 [PLATFORM] MIDI nativo:${platform.hasNativeMidi} (ALSA seq:${platform.hasAlsaSeq})`);
console.log(`🔍 [PLATFORM] DMX:${platform.supportsDmx} Systray:${platform.supportsSystray}`);
if (platform.isAndroid) {
  console.log(`🔍 [PLATFORM] Android ${process.env.ANDROID_ROOT} | Build: ${os.release()}`);
}

module.exports = platform;
