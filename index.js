const {
  create: createYoutubeDl
} = require('youtube-dl-exec')
const {
  spawn
} = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const {
  fork
} = require("child_process");
const mkdirp = require('mkdirp')

const urlencode = require('urlencode');
const fullYoutubeDlPath = path.join(__dirname, '../bootleg-link/assets/youtube-dl');
const fullAria2cPath = path.join(__dirname, '../bootleg-link/assets/aria2c');
const fullFFmpegPath = path.join(__dirname, '../bootleg-link/assets/ffmpeg');
console.log("fullYoutubeDlPath:", fullYoutubeDlPath);
console.log("fullAria2cPath:", fullAria2cPath);
console.log("fullFFmpegPath:", fullFFmpegPath);

spawn('cp', [fullYoutubeDlPath, '/tmp/youtube-dl']);
spawn('cp', [fullAria2cPath, '/tmp/aria2c']);
spawn('cp', [fullFFmpegPath, '/tmp/ffmpeg']);


// process.exit();

const tmpYoutubeDlPath = path.join('/tmp', './youtube-dl');
const tmpAria2cPath = path.join('/tmp', './aria2c');
const tmpFFmpegPath = path.join('/tmp', './ffmpeg');

const taskPath = path.join(process.cwd(), process.argv[2]);
const taskName = taskPath.split("/").pop();
const outputPath = path.join(process.cwd(), 'output', taskName);
mkdirp.sync(outputPath);

const taskUrlList = fs.readFileSync(taskPath, {encoding:'utf8', flag:'r'});

taskUrlList.split('\n').forEach(url => {
  const youtubedl = createYoutubeDl(fullYoutubeDlPath)
  const downloaderQuene = [];
  let downloaderQueneIndex = 0;
  const spawnOpt = { cwd: outputPath };
  const dl = () => {
    try {
      spawn('rm', ['-rf', fileLock], spawnOpt);
      const child = spawn(fullYoutubeDlPath, [url, '--flat-playlist', '--proxy', 'socks5://127.0.0.1:1080', '--get-id'], spawnOpt);
      child.stdout.on('data', (chunk) => {
        downloaderQuene.push(chunk);
      });
    } catch (e) {}
  }

  const interval = setInterval(() => {
    try {
      dl();
      clearInterval(interval);
    } catch (e) {
      console.log(e);
    }
  }, 1000);

  const fileLock = `downloader.lock`;
  spawn('rm', ['-rf', fileLock], spawnOpt);
  const blockRegExp = /Full Set|Festival 20|Full HD/;

  setInterval(() => {
    const fileList = fs.readdirSync(outputPath);
    const chunk = downloaderQuene[downloaderQueneIndex];
    if (chunk && fileList.indexOf(fileLock) <= -1) {
      fs.closeSync(fs.openSync(fileLock, 'w'));
      const urlItem = `https://www.youtube.com/watch?v=${chunk.toString()}`;
      let success = false;
      try {
        youtubedl(urlItem, {
          "getTitle": true,
          "proxy": "http://127.0.0.1:1087",
          "restrictFilenames": true,
        }).then(titleArg => {
          if (blockRegExp.test(titleArg)) {
            return;
          }
          let title = titleArg.replaceAll(/\*/g, ' ');
          title = title.replaceAll(/["'\/,]/g, ' ');
          const fileList = fs.readdirSync(outputPath);
          if (fileList.indexOf(`${title}.aiff`) > -1 && fileList.indexOf(`${title}.webp`) <= -1) {
            success = true;
            console.log(`Already exist, skip ${title}.m4a`);
            spawn('rm', ['-rf', fileLock], spawnOpt);
            return;
          }
          console.log(`Start downloading ${title}.m4a`);
          const argvArr = [urlItem, JSON.stringify({
            "proxy": "http://127.0.0.1:1087",
            "externalDownloader": tmpAria2cPath,
            "externalDownloaderArgs": "-c -j 16 -x 16 -s 16 -k 1M",
            "embedThumbnail": true,
            "format": "bestaudio",
            "output": `${title}.m4a`,
            "extractAudio": true,
            "audioFormat": "m4a",
            "ffmpegLocation": tmpFFmpegPath,
            "restrictFilenames": true,
          }), urlencode(title)];
          console.log('Argv:', argvArr);
          setTimeout(() => fork(path.join(__dirname, "downloader.js"), argvArr, {
            cwd: outputPath
          }), 0);
        }).catch(e => console.log(e) || dl());
      } catch (e) {
        console.log(`Already expcetion, skip ${title}.m4a`);
      }
      downloaderQueneIndex++;
    }
  }, 200);
});
