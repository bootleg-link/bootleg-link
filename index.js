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
  // todo win linuxx
  if (!isDarwin) {
    return 'socks5://127.0.0.1:1080/'
  }

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
const singleSoundcloudRegexp = /soundcloud.com\/[^?\/]*\/(?!sets)/
const singleBandcampPrefix = /bandcamp.com\/(?!album)/
const mainDownloader = async () => {
  const proxy = await getProxy();
  // const interval = setInterval(() => {
    // trackParallellDownloader(proxy).then();
  // }, 1000);
  for (let index in playlistUrlList) {
    // playlist meta dump json
    let url = playlistUrlList[index];
    if (!url) {
      continue;
    }
    const isSingleYtbVideo = url.indexOf(singleYtbVideoPrefix) > -1 && url.indexOf('&list=') === -1
      || url.indexOf('https://youtu.be/') > -1;
    const isSingleSoundcloud = singleSoundcloudRegexp.test(url);
    const isSingleBandcamp = singleBandcampPrefix.test(url);
    const isArtistAndSongName = url.indexOf("https://") === -1 && url.indexOf("http://") === -1

    // url postproc
    if (isArtistAndSongName) {
      url = url
        .replace(/\d+[.:]\d+/ , '')
        .replace(/\d+[.:]/ , '');
      url = "https://www.youtube.com/results?search_query=" + url.replaceAll(/[()&\s,\\\/]/g, "+") + "";
    }
    await new Promise(resolver => {
      let spawnArg = [
        url,
      ];
      if (proxy) {
        spawnArg.push('--proxy');
        spawnArg.push(proxy)
      }
      if (isArtistAndSongName) {
        console.log('[debug] tag0');
        console.log(url)
        spawnArg = spawnArg.concat([
          '--dump-json',
          '--flat-playlist',
          '--playlist-start', '1',
          '--playlist-end', '1',
          "--get-id"
        ]);
      } else if (!isSingleYtbVideo && !isSingleSoundcloud && !isSingleBandcamp) {
        console.log('[debug] tag1');
        spawnArg = spawnArg.concat([
          '--dump-json',
          '--flat-playlist',
          '--playlist-start', '1',
          '--playlist-end', '1000',
        ]);
      } else {
        console.log('[debug] tag2');
        spawnArg = spawnArg.concat([
          '--get-title',
        ]);
      }
      const child = spawn(tmpYoutubeDlPath, spawnArg, spawnOpt);
      child.stdout.on('data', data => {
        // console.log('[debug] tag3', data.toString());
        data.toString().split('\n').forEach(dataItem => {
          if (isArtistAndSongName) {
            const meta = tryJSON.parse(dataItem);
            if (meta) {
              if (meta.length > 0) {
                meta.forEach(item => trackMetaList.push(item));
              } else {
                trackMetaList.push(meta);
              }
              meta.title = meta.title || meta.webpage_url_basename;
              console.log('Meta list added playlist by ArtistAndSongName: ', { url: meta.url, title: meta.title });
            }
          } else if (isSingleYtbVideo || isSingleSoundcloud || isSingleBandcamp) {
            const title = dataItem;
            if (title) {
              trackMetaList.push({ url, title });
              console.log('Meta list added single: ', { url, title });
            }
          } else {
            const meta = tryJSON.parse(dataItem);
            if (meta) {
              if (meta.length > 0) {
                meta.forEach(item => trackMetaList.push(item));
              } else {
                trackMetaList.push(meta);
              }
              meta.title = meta.title || meta.webpage_url_basename;
              console.log('Meta list added playlist: ', { url: meta.url, title: meta.title });
              // console.log('Meta list added: ', meta.title);
            }
          }
        });
      });
      child.on('close', (chunk) => {
        resolver();
      });
      child.stderr.on('data', data => console.log(data.toString()));
    });
    setTimeout(() => {
      trackParallellDownloader(proxy).then();
    });
  }
};
mainDownloader();

// Track batch downloader
const blockRegExp = /Full Set|Festival 20|Full HD|Podcast/;
let totalDownloaded = 0;
const audioFormat = 'm4a';
const finalAudioFormat = 'mp3';
const trackParallellDownloader = async (proxy) => {
  // Parallel downloading
  const asyncFun = async (asyncIndex) => {
    while(true) {
      // All tracks download finished
      if (trackMetaList.length === 0) {
        console.log('Async worker' + asyncIndex + ' download finished');
        // downloading = false;
        break;
      }
      const { url, title } = trackMetaList.shift();
      if (fs.readdirSync(outputPath).indexOf(title + '.' + finalAudioFormat) > -1 &&
        fs.readdirSync(outputPath).indexOf(title + '.' + 'webm') === -1) {
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
          '--format', 'bestaudio',
          '-o', title + '.' + finalAudioFormat,
          '-N', '4',
          '--embed-thumbnail',
          // '--restrict-filenames',
          '--convert-thumbnails', 'jpg',
          '--extract-audio',
          '--audio-format', finalAudioFormat,
          // '--audio-quality', '0',
          '--audio-quality', '320k',
          '--ffmpeg-location', tmpFFMpegPath,
          // '--downloader', fullAria2cPath,
          // '--downloader-args', '-c -j 16 -x 16 -s 16 -k 1M',
          // '--ppa', 'ExtractAudio:-c:a aac -b:a 256k',
          // '--ppa', 'ExtractAudio:-b:a 320k',
        ];
        if (proxy) {
          spawnArg.push('--proxy');
          spawnArg.push(proxy)
        }
        const child = spawn(tmpYoutubeDlPath, spawnArg, spawnOpt);
        console.log('cmd', tmpYoutubeDlPath + ' ' + spawnArg.join(' '))
        child.stdout.on('data', (chunk) => {
          console.log(chunk.toString());
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
