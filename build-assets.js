const { exec } = require("child_process");
const fs = require("fs");
const https = require("https");

// Directory where FFmpeg will be built
const ffmpegBuildDir = "./ffmpeg_build";
// yt-dlp download URL
const ytDlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
const ytDlpPath = "./yt-dlp";

// Function to execute shell commands
function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                reject(error);
            }
            console.log(stdout);
            resolve(stdout);
        });
    });
}

// Function to download yt-dlp
function downloadYtDlp() {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(ytDlpPath);
        https.get(ytDlpUrl, (response) => {
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                console.log("Downloaded yt-dlp");
                // Make the file executable (Unix-like OS)
                fs.chmod(ytDlpPath, 0o755, (err) => {
                    if (err) throw err;
                    resolve();
                });
            });
        }).on("error", (err) => {
            fs.unlink(ytDlpPath);
            reject(err);
        });
    });
}

async function main() {
    try {
        // Clone FFmpeg
        if (!fs.existsSync(ffmpegBuildDir)) {
            fs.mkdirSync(ffmpegBuildDir, { recursive: true });
            await runCommand(`git clone https://git.ffmpeg.org/ffmpeg.git ${ffmpegBuildDir}`);
        }

        // Configure and build FFmpeg
        await runCommand(`cd ${ffmpegBuildDir} && ./configure && make`);

        // Download yt-dlp
        if (!fs.existsSync(ytDlpPath)) {
            await downloadYtDlp();
        }
    } catch (error) {
        console.error("Failed to complete operations:", error);
    }
}

main();
