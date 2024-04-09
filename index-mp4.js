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
const { getProxySettings, getAndTestProxySettings } = require("get-proxy-settings");
const { getSettingsSync } = require('macos-system-proxy-settings')
const pac = require('pac-resolver');
const got = require('got');

// config
const DOWNLOADER_PARALLEL_COUNT = 10;

// os
const isWin = os.platform() === 'win32';
const isDarwin = os.platform() === 'darwin';
const isLinux = !isWin && !isDarwin;

const fullYoutubeDlPath = path.join(__dirname, isWin ?
  '../bootleg-link/assets/youtube-dl.exe' :
  '../bootleg-link/assets/youtube-dl');
const fullFFMpegPath = path.join(__dirname, isWin ?
  '../bootleg-link/assets/ffmpeg.exe' :
  '../bootleg-link/assets/ffmpeg');
// const fullAria2cPath = path.join(__dirname, '../bootleg-link/assets/aria2c');
// const fullFFmpegPath = path.join(__dirname, '../bootleg-link/assets/ffmpeg');

const tmpDirConfig = tmp.dirSync();
const tmpYoutubeDlPath = path.join(tmpDirConfig.name, isWin ? 'youtube-dl.exe' : 'youtube-dl');
const tmpFFMpegPath = path.join(tmpDirConfig.name, isWin ? 'ffmpeg.exe' : 'ffmpeg');

if (!fs.existsSync(tmpYoutubeDlPath) ||
  fs.statSync(tmpYoutubeDlPath).mtime !== fs.statSync(fullYoutubeDlPath).mtime) {
  fs.copySync(fullYoutubeDlPath, tmpYoutubeDlPath);
}

if (!fs.existsSync(tmpFFMpegPath) ||
  fs.statSync(tmpFFMpegPath).mtime !== fs.statSync(fullFFMpegPath).mtime) {
  fs.copySync(fullFFMpegPath, tmpFFMpegPath);
}

// spawn('cp', [fullAria2cPath, '/tmp/aria2c']);
// spawn('cp', [fullFFmpegPath, '/tmp/ffmpeg']);

// const tmpAria2cPath = path.join('/tmp', './aria2c');
// const tmpFFmpegPath = path.join('/tmp', './ffmpeg');

const pathSep = isWin ? '\\' : '/'
const taskPathArgv = process.argv[2];
const taskPath = !/^[~|\/]/.test(taskPathArgv) ?
  path.join(process.cwd(), taskPathArgv) :
  path.join(taskPathArgv);
const allowBlocked = process.argv[3];
const taskPathList = taskPath.split(pathSep);
const taskName = taskPathList.pop().split('.')[0];
const taskPathBase = path.join(taskPathList.join(pathSep), '..');
const outputPath = path.join(taskPathBase, 'output', taskName);
mkdirp.sync(outputPath);

const playlistUrlListStr = fs.readFileSync(taskPath, {encoding:'utf8', flag:'r'});
const playlistUrlList = playlistUrlListStr.split('\n');

// output dir opt
const spawnOpt = {
  cwd: outputPath,
  // stdio: 'inherit',
  // shell: true,
};

// proxy
async function getProxy() {
  let proxy = '';
  const sysProxySettings = getSettingsSync();
  console.log('sysProxySettings:', sysProxySettings);
  const { ProxyAutoConfigURLString, HTTPPort, HTTPProxy, SOCKPort, SOCKProxy } = sysProxySettings;
  if (ProxyAutoConfigURLString) {
    const plainPac = (await got(ProxyAutoConfigURLString)).body;
    // console.log('plainPac:', plainPac);
    const FindProxyForURL = pac(plainPac);
    await new Promise(resolver => {
      FindProxyForURL('https://www.youtube.com/').then((res) => {
        console.log('pac proxy address:', res);
        proxy = res
          .replace('proxy address: ', '')
          .replace('SOCKS5 ', 'socks5://')
          .replace('0.0.0.0', '127.0.0.1')
          .replace(/;.*/, '/');
        resolver();
      });
    });
  } else if (HTTPPort && HTTPProxy) {
    proxy = 'http://' + HTTPProxy.replace('0.0.0.0', '127.0.0.1') + ':' + HTTPPort + '/';
  } else if (SOCKPort && SOCKProxy) {
    proxy = 'socks5://' + SOCKProxy.replace('0.0.0.0', '127.0.0.1') + ':' + SOCKPort + '/';
  }
  console.log('final proxy address:', proxy);
  return proxy;
}

// Playlist meta json dump
const trackMetaList = [];
const singleYtbVideoPrefix = 'https://www.youtube.com/watch'
const mainDownloader = async () => {
  const proxy = await getProxy();
  for (let index in playlistUrlList) {
    // playlist meta dump json
    const url = playlistUrlList[index];
    const isSingleYtbVideo = url.indexOf(singleYtbVideoPrefix) > -1 && url.indexOf('&list=') === -1
      || url.indexOf('https://youtu.be/') > -1;
    await new Promise(resolver => {
      let spawnArg = [
        url,
      ];
      if (proxy) {
        spawnArg.push('--proxy');
        spawnArg.push(proxy)
      }
      if (!isSingleYtbVideo) {
        spawnArg = spawnArg.concat([
          '--dump-json',
          '--flat-playlist',
          '--playlist-start', '1',
          '--playlist-end', '1000',
        ]);
      } else {
        spawnArg = spawnArg.concat([
          '--get-title',
        ]);
      }
      const child = spawn(tmpYoutubeDlPath, spawnArg, spawnOpt);
      child.stdout.on('data', data => {
        data.toString().split('\n').forEach(dataItem => {
          if (isSingleYtbVideo) {
            const title = dataItem;
            if (title) {
              trackMetaList.push({ url, title });
              console.log('Meta list added: ', title);
            }
          } else {
            const meta = tryJSON.parse(dataItem);
            if (meta) {
              if (meta.length > 0) {
                meta.forEach(item => trackMetaList.push(item));
              } else {
                trackMetaList.push(meta);
              }
              console.log('Meta list added: ', meta.title);
            }
          }
        });
      });
      child.on('close', (chunk) => {
        resolver();
      });
    });
    setTimeout(() => {
      trackParallellDownloader(proxy).then();
    });
  }
};
mainDownloader();

// Track batch downloader
const blockRegExp = /Full Set|Festival 20|Full HD|Podcast/;
let downloading = false;
let totalDownloaded = 0;
const audioFormat = 'mp4';
const trackParallellDownloader = async (proxy) => {
  // lock
  if (downloading) {
    return;
  }
  downloading = true;
  // console.log('trackMetaList:', trackMetaList);

  // Parallel downloading
  const asyncFun = async (asyncIndex) => {
    while(true) {
      // All tracks download finished
      if (trackMetaList.length === 0) {
        console.log('Async worker' + asyncIndex + ' download finished');
        downloading = false;
        break;
      }
      const { url, title } = trackMetaList.shift();
      if (fs.readdirSync(outputPath).indexOf(title + '.' + audioFormat) > -1) {
        console.log('Already downloaded: ' + title);
        console.log('Total downloaded:', ++ totalDownloaded);
        continue;
      }
      if (allowBlocked !== '--allow-blocked' && blockRegExp.test(title)) {
        console.log('Blocked Festival or Set download: ' + title);
        continue;
      }
      console.log('Start downloading: ' + title);
      await new Promise(spResolver => {
        const spawnArg = [
          url,
          '--format', 'mp4',
          '-o', '%(title)s.%(ext)s',
          '-N', '4',
          '--restrict-filenames',
          // '--embed-thumbnail',
          // '--restrict-filenames',
          // '--convert-thumbnails', 'jpg',
          // '--extract-audio',
          // '--video-format', audioFormat,
          // '--audio-quality', '0',
          '--ffmpeg-location', tmpFFMpegPath,
          // '--downloader', fullAria2cPath,
          // '--downloader-args', '-c -j 16 -x 16 -s 16 -k 1M',
        ];
        if (proxy) {
          spawnArg.push('--proxy');
          spawnArg.push(proxy)
        }
        const child = spawn(tmpYoutubeDlPath, spawnArg, spawnOpt);
        child.stdout.on('data', (chunk) => {
          // console.log(chunk.toString());
        });
        child.on('close', (chunk) => {
          console.log('Finish downloading: ' + path.join(outputPath, title + '.' + audioFormat));
          console.log('Total downloaded:', ++ totalDownloaded);
          spResolver();
        });
      });
    };
  };
  await Array(DOWNLOADER_PARALLEL_COUNT).fill(1).map((item, index) => asyncFun(index + 1));
}
