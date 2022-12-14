// const spawn = require('await-spawn')
const {
  spawn,
} = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const mkdirp = require('mkdirp')
const tryJSON = require('tryjson');
const os = require('os');
const urlencode = require('urlencode');
const tmp = require('tmp');

// config
const DOWNLOADER_PARALLEL_COUNT = 20;

// os
const isWin = os.platform() === 'win32';
const isDarwin = os.platform() === 'darwin';
const isLinux = !isWin && !isDarwin;

const fullYoutubeDlPath = path.join(__dirname, isWin ?
  '../bootleg-link/assets/youtube-dl.exe' :
  '../bootleg-link/assets/youtube-dl');
// const fullAria2cPath = path.join(__dirname, '../bootleg-link/assets/aria2c');
// const fullFFmpegPath = path.join(__dirname, '../bootleg-link/assets/ffmpeg');

const tmpDirConfig = tmp.dirSync();
const tmpYoutubeDlPath = path.join(tmpDirConfig.name, isWin ? 'youtube-dl.exe' : 'youtube-dl');

if (!fs.existsSync(tmpYoutubeDlPath) ||
  fs.statSync(tmpYoutubeDlPath).mtime !== fs.statSync(fullYoutubeDlPath).mtime) {
  fs.copySync(fullYoutubeDlPath, tmpYoutubeDlPath);
}

// spawn('cp', [fullAria2cPath, '/tmp/aria2c']);
// spawn('cp', [fullFFmpegPath, '/tmp/ffmpeg']);

// const tmpAria2cPath = path.join('/tmp', './aria2c');
// const tmpFFmpegPath = path.join('/tmp', './ffmpeg');

const taskPath = path.join(process.cwd(), process.argv[2]);
const allowBlocked = process.argv[3];
const taskName = taskPath.split(isWin ? '\\' : '/').pop();
const outputPath = path.join(process.cwd(), 'output', taskName);
mkdirp.sync(outputPath);

const playlistUrlListStr = fs.readFileSync(taskPath, {encoding:'utf8', flag:'r'});
const playlistUrlList = playlistUrlListStr.split('\n');

// output dir opt
const spawnOpt = {
  cwd: outputPath,
  // stdio: 'inherit',
  // shell: true,
};


// Playlist meta json dump
const trackMetaList = [];
const playlistMetaDownloader = async () => {
  for (let index in playlistUrlList) {
    // playlist meta dump json
    const url = playlistUrlList[index];
    await new Promise(resolver => {
      const child = spawn(tmpYoutubeDlPath, [
        url,
        '--proxy', 'socks5://127.0.0.1:1080/',
        '--dump-json',
        '--flat-playlist',
        '--playlist-start', '1',
        '--playlist-end', '1000',
      ], spawnOpt);
      child.stdout.on('data', data => {
        data.toString().split('\n').forEach(dataItem => {
          const meta = tryJSON.parse(dataItem);
          if (meta) {
            if (meta.length > 0) {
              meta.forEach(item => trackMetaList.push(item));
            } else {
              trackMetaList.push(meta);
            }
            console.log('Meta list added: ', meta.title);
          }
        });
      });
      child.on('close', (chunk) => {
        resolver();
      });
    });
    await trackParallellDownloader();
  }
};
playlistMetaDownloader();

// Track batch downloader
const blockRegExp = /Full Set|Festival 20|Full HD|Podcast/;
let downloading = false;
let totalDownloaded = 0;
const trackParallellDownloader = async () => {
  // lock
  if (downloading) {
    return;
  }
  downloading = true;
  // console.log('trackMetaList:', trackMetaList);

  // Parallel downloading
  const asyncFun = async () => {
    while(true) {
      // All tracks download finished
      if (trackMetaList.length === 0) {
        console.log('download finished');
        downloading = false;
        break;
      }
      const { url, title } = trackMetaList.shift();
      if (fs.readdirSync(outputPath).indexOf(title + '.m4a') > -1) {
        console.log('Already downloaded: ' + title);
        console.log('Total downloaded:', ++ totalDownloaded);
        continue;
      }
      if (allowBlocked !== '--allow-blocked' && blockRegExp.test(title)) {
        console.log('Blocked download: ' + title);
        continue;
      }
      console.log('Start downloading: ' + title);
      await new Promise(spResolver => {
        const child = spawn(fullYoutubeDlPath, [url,
          '--proxy', 'socks5://127.0.0.1:1080/',
          '--format', 'm4a/bestaudio/best',
          '-o', '%(title)s.%(ext)s',
          '-N', '10',
          '--embed-thumbnail',
          // '--restrict-filenames',
          '--convert-thumbnails', 'jpg',
          // '--downloader', fullAria2cPath,
          // '--downloader-args', '-c -j 16 -x 16 -s 16 -k 1M',
        ], spawnOpt);
        child.stdout.on('data', (chunk) => {
          // console.log(chunk.toString());
        });
        child.on('close', (chunk) => {
          console.log('Finish downloading: ' + title);
          console.log('Total downloaded:', ++ totalDownloaded);
          spResolver();
        });
      });
    };
  };
  await Array(DOWNLOADER_PARALLEL_COUNT).fill(1).map((item, index) => asyncFun());
}
