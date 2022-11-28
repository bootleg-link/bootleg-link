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
      const child = spawn(fullYoutubeDlPath, [url, '--flat-playlist', '--proxy', 'socks5://127.0.0.1:1080', '--get-id'], spawnOpt);
      child.stdout.on('data', (chunk) => {
        // todo count > 1000 not hard code
        // Hint: cause CDJ playlist max count is 1000
        // if (downloaderQuene.length < 1000) {
          downloaderQuene.push(chunk);
        // }
      });
      // const child =spawn(fullYoutubeDlPath, [url,
        // '--proxy', 'socks5://127.0.0.1:1080',
        // '--format', 'bestaudio',
        // '--external-downloader', tmpAria2cPath,
        // '--external-downloader-args', '-c -j 16 -x 16 -s 16 -k 1M',
        // // '--print', 'filename',
        // '-o', '%(title)s.%(ext)s',
        // '--restrict-filenames',
      // ], spawnOpt)
      // child.stdout.on('data', (chunk) => {
        // console.log(chunk.toString());
      // });
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

  spawn('rm', ['-rf', "downloader*.lock"], spawnOpt);
  const blockRegExp = /Full Set|Festival 20|Full HD|Podcast/;

  const dlInterval = setInterval(() => {
    // 5 thread
    const fileLock = `downloader${downloaderQueneIndex % 5}.lock`;
    const fileList = fs.readdirSync(outputPath);
    const chunk = downloaderQuene[downloaderQueneIndex];
    console.log('chunk:', chunk);
    if (chunk && fileList.indexOf(fileLock) <= -1) {
      fs.closeSync(fs.openSync(path.join(outputPath, fileLock), 'w'));
      const urlItem = `https://www.youtube.com/watch?v=${chunk.toString()}`;
      let success = false;
      try {
        youtubedl(urlItem, {
          "getTitle": true,
          "proxy": "http://127.0.0.1:1087",
          "restrictFilenames": true,
        }).then(titleArg => {
          if (blockRegExp.test(titleArg)) {
            console.log(`Blocked, skip ${title}.m4a`);
            spawn('rm', ['-rf', fileLock], spawnOpt);
            return;
          }
          let title = titleArg.replaceAll(/\*/g, ' ');
          title = title.replaceAll(/["'\/,]/g, ' ');
          const fileList = fs.readdirSync(outputPath);
          if (fileList.indexOf(`${title}.m4a`) > -1 && fileList.indexOf(`${title}.webp`) <= -1) {
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
          setTimeout(() => fork(path.join(__dirname, "downloader.js"), argvArr, spawnOpt), 0);
        }).catch(e => console.log(e) || dl());
      } catch (e) {
        console.log(`Already expcetion, skip ${title}.m4a`);
      }
      downloaderQueneIndex++;
      // if (downloaderQuene.length > 0 &&
        // downloaderQuene.length <= downloaderQueneIndex) {
        // clearInterval(dlInterval);
      // }
    }
  }, 200);
});
