const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const MusicTempo = require('music-tempo');

function calculateBPM(buffer) {
  let audioData = [];
  // Convert buffer to Float32Array
  for (let i = 0; i < buffer.length; i += 4) {
    audioData.push(buffer.readFloatLE(i));
  }
  try {
    let mt = new MusicTempo(audioData);
    console.log('Detected BPM:', mt.tempo);
    return mt.tempo;
  } catch (e) {
    console.error('Could not detect BPM:', e);
    return null;
  }
}

function changeBPM(inputFile, outputFile, targetBPM) {
  // Step 1: Convert MP3 to WAV for processing (assuming ffmpeg is installed)
  const wavFile = inputFile.replace('.mp3', '.wav');
  execSync(`ffmpeg -i ${inputFile} ${wavFile}`);

  // Step 2: Read WAV file for BPM detection
  const buffer = fs.readFileSync(wavFile);
  const detectedBPM = calculateBPM(buffer);

  // Step 3: Calculate ratio and use soundstretch to adjust BPM
  const ratio = targetBPM / detectedBPM;
  execSync(`soundstretch ${wavFile} ${outputFile} -tempo=${(ratio - 1) * 100}`);

  console.log(`Audio processed and saved to ${outputFile}`);
}

// os
const isWin = os.platform() === 'win32';
const isDarwin = os.platform() === 'darwin';
const isLinux = !isWin && !isDarwin;

// argv
const pathSep = isWin ? '\\' : '/'
const taskPathArgv = process.argv[2];
const taskPath = !/^[~|\/]/.test(taskPathArgv) ?
  path.join(process.cwd(), taskPathArgv) :
  path.join(taskPathArgv);

// Example usage
// const inputFile = 'path/to/input.mp3';
// const outputFile = 'path/to/output.wav'; // soundstretch works with WAV files
// const targetBPM = 120; // Desired BPM
// changeBPM(inputFile, outputFile, targetBPM);
