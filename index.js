// const spawn = require('await-spawn')
const {
  spawn,
  spawnSync,
  fork,
} = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const mkdirp = require('mkdirp')
const tryJSON = require('tryjson');

// config
const DOWNLOADER_PARALLEL_COUNT = 10;

const urlencode = require('urlencode');
const fullYoutubeDlPath = path.join(__dirname, '../bootleg-link/assets/youtube-dl');
// const fullAria2cPath = path.join(__dirname, '../bootleg-link/assets/aria2c');
// const fullFFmpegPath = path.join(__dirname, '../bootleg-link/assets/ffmpeg');
// console.log("fullAria2cPath:", fullAria2cPath);
// console.log("fullFFmpegPath:", fullFFmpegPath);

const tmpYoutubeDlPath = path.join('/tmp', 'youtube-dl');

if (!fs.existsSync(tmpYoutubeDlPath) ||
  fs.statSync(tmpYoutubeDlPath).mtime !== fs.statSync(fullYoutubeDlPath).mtime) {
  spawnSync('cp', ['-rp', fullYoutubeDlPath, tmpYoutubeDlPath]);
}

// spawn('cp', [fullAria2cPath, '/tmp/aria2c']);
// spawn('cp', [fullFFmpegPath, '/tmp/ffmpeg']);


// process.exit();

// const tmpAria2cPath = path.join('/tmp', './aria2c');
// const tmpFFmpegPath = path.join('/tmp', './ffmpeg');

const taskPath = path.join(process.cwd(), process.argv[2]);
const taskName = taskPath.split("/").pop();
const outputPath = path.join(process.cwd(), 'output', taskName);
mkdirp.sync(outputPath);

const playlistUrlListStr = fs.readFileSync(taskPath, {encoding:'utf8', flag:'r'});
const playlistUrlList = playlistUrlListStr.split('\n');

// output dir opt
const spawnOpt = {
  cwd: outputPath,
  // stdio: 'inherit',
  // shell: true,
  // stdio: 'inherit',
};


// Playlist meta json dump
const trackMetaList = [];
playlistUrlList.forEach(url => {
  // playlist meta dump json
  const child = spawn(tmpYoutubeDlPath, [
    url,
    '--proxy', 'socks5://127.0.0.1:1080/',
    '--dump-json',
    '--flat-playlist'
  ], spawnOpt);
  child.stdout.on('data', data => {
    // console.log('data', tryJSON.parse(data));
    const meta = tryJSON.parse(data);
    if (meta) {
      trackMetaList.push(meta);
    }
    trackParallellDownloader();
  });
});


let downloading = false;
const trackParallellDownloader = async () => {
  // lock
  if (downloading) {
    return;
  }
  downloading = true;
  console.log('trackMetaList:', trackMetaList.toString());

  // Parallel downloading
  await Promise.all(Array(DOWNLOADER_PARALLEL_COUNT).fill((async () => {
    while(true) {
      // All tracks download finished
      if (trackMetaList.length === 0) {
        console.log('download finished');
        downloading = false;
        resolve();
        break;
      }
      const { url, title } = trackMetaList.shift();
      console.log('Start downloading: ' + title);
      await new Promise(spResolver => {
        const child = spawn(fullYoutubeDlPath, [url,
          '--proxy', 'socks5://127.0.0.1:1080/',
          '--format', 'm4a/bestaudio/best',
          '-o', '%(title)s.%(ext)s',
          '-N', '10',
          '--embed-thumbnail',
          // '--restrict-filenames',
          // '--downloader', tmpAria2cPath,
          // '--downloader-args', '-c -j 16 -x 16 -s 16 -k 1M',
        ], spawnOpt)
        child.stdout.on('data', (chunk) => {
          // console.log(chunk.toString());
          spResolver();
          console.log('Finish downloading: ' + title);
        });
      });
    }
  })()));
}

// const metaDump = async () => {
  // try {
    // // const data = execSync(`${tmpYoutubeDlPath} ${url.replaceAll('/', '\\/')} --proxy socks5://127.0.0.1:1080/ --dump-json --flat-playlist`,
    // const child = spawn(tmpYoutubeDlPath, [url,
      // '--proxy', 'socks5://127.0.0.1:1080/',
      // '--dump-json',
      // '--flat-playlist'
    // ], spawnOpt);
    // child.stdout.on('data', (data) => {
      // console.log(`child stdout:\n${data}`);
    // });
    // let json;
    // console.log(data);
    // try {
      // json = JSON.parse(data.toString());
      // console.log(json);
    // } catch (e) {
      // console.log(e);
      // return;
    // }
  // } catch (e) {
    // console.log(e)
  // }
// }
// metaDump()
