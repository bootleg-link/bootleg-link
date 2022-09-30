const {
  create: createYoutubeDl
} = require('youtube-dl-exec');

const fs = require('fs-extra');
const path = require('path');
const fullFFmpegPath = path.join(__dirname, '../bootleg-link/assets/ffmpeg');
const tmpFFmpegPath = path.join('/tmp', './ffmpeg');
const {
  spawn
} = require('child_process');
const urlencode = require('urlencode');
const {
  clearInterval
} = require('timers');

const urlItem = process.argv[2];
const conf = process.argv[3];
const title = urlencode.decode(process.argv[4]);
const fileLock = `downloader.lock`;

const fullYoutubeDlPath = path.join(__dirname, '../bootleg-link/assets/youtube-dl');
const youtubedl = createYoutubeDl(fullYoutubeDlPath)

const handleDl = () => {
  let proc = spawn('ffmpeg', ['-y', '-i', `${title}.m4a`, '-write_id3v2', '1', '-c:v', 'copy', `${title}.aiff`]);
  const fileList = fs.readdirSync('./');
  const doHandleDl = () => {
    setTimeout(() => {
      spawn('rm', ['-rf', fileLock]);
      const fileList = fs.readdirSync('./');
      if (fileList.indexOf(`${title}.aiff`) <= -1) {
        return;
      }
      spawn('rm', ['-rf', `${title}.m4a`]);

      // embed cover ondemand
      if (fileList.indexOf(`${title}.m4a.jpg`) > -1) {
        spawn('kid3-cli', [
          '-c', `select "${title}.aiff"`,
          '-c', `set picture:"${title}.m4a.jpg" ""`,
          '-c', 'save'
        ]).on('exit', () => {
          spawn('rm', ['-rf', `${title}.m4a.jpg`]);
        });
      }
    }, 10 * 1000);
  }

  let didHandle = false;
  proc.on('exit', function (data) {
    if (didHandle) {
      return;
    }
    doHandleDl();
    didHandle = true;
  });
  proc.stderr.on('data', function (data) {
    if (didHandle) {
      return;
    }
    console.error(data.toString());
    doHandleDl();
    didHandle = true;
  });
}
const doDl = () => youtubedl(urlItem, JSON.parse(conf)).then(output => {
  success = true;
  console.log(tmpFFmpegPath);
  handleDl();
  return output;
}).catch(e => console.log(e) || handleDl());

let downloaderStarted = false;
const interval = setInterval(() => {
  const fileList = fs.readdirSync('./');
  // if (fileList.indexOf(fileLock) <= -1) {
    // fs.closeSync(fs.openSync(fileLock, 'w'));
    doDl();
    downloaderStarted = true;
    clearInterval(interval);
  // }
}, 1000);
