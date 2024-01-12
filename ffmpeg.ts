import type { PluginOption, ViteDevServer } from "vite";
import {
  ChildProcessWithoutNullStreams,
  exec,
  spawn,
} from "node:child_process";
import { Readable, Writable } from "stream";

let isFfmpegInstalled = false;
let isFfmpegReady = false; // ready to receive a new frame?

let framesRecorded = 0;

export const ffmpeg = (): PluginOption => ({
  name: "ffmpeg-export",
  apply: "serve",
  async configureServer(server: ViteDevServer) {
    // check for ffmpeg install first when plugin is loaded
    try {
      console.log(await execPromise(`ffmpeg -version`));

      isFfmpegInstalled = true;
    } catch (error: any) {
      // if no ffmpeg, warn and abort
      const msg = `${error}`;
      server.ws.send("ssam:warn", {
        msg,
        abort: true,
      });
      console.warn(`${msg}`);
    }

    let command: ChildProcessWithoutNullStreams;
    let stdin: Writable;
    let stdout: Readable;
    let stderr: Readable;

    // this message is received when client starts a new recording
    server.ws.on("ssam:ffmpeg", async (data, client) => {
      if (!isFfmpegInstalled) {
        const msg = `ffmpeg was not found`;
        client.send("ssam:warn", { msg });
        console.warn(msg);
        return;
      }

      // reset frame count per each recording
      framesRecorded = 0;

      const inputArgs =
        `-f image2pipe -framerate ${data.fps} -c:v png -i -`.split(" ");
      //prettier-ignore
      const outputArgs = [
              "-c:v", "libx264", "-pix_fmt", "yuv420p",
              "-preset", "slow", "-crf", "18", "-r", data.fps,
              '-movflags', '+faststart',
            ]

      command = spawn("ffmpeg", [
        "-y",
        ...inputArgs,
        ...outputArgs,
        "-report",
        `./out.mp4`,
      ]);

      // get stdin from ffmpeg process
      ({ stdin, stdout, stderr } = command);

      // https://nodejs.org/api/child_process.html#child-process
      // need to consume data as ffmpeg also does stderr.write(cb) and waiting.
      // otherwise, it fills up the buffer
      // thanks to greweb for pointing it out

      // REVIEW: there must be a more elegant way to handle this.
      // I tried spawn(... { stdio: 'ignore' }) but with error.
      stdout.on("data", (data) => {});
      stderr.on("data", (data) => {});

      isFfmpegReady = true;

      // set is ready, request a frame
      client.send("ssam:ffmpeg-reqframe");
    });

    server.ws.on("ssam:ffmpeg-newframe", async (data, client) => {
      if (!isFfmpegInstalled || !isFfmpegReady) return;

      // record a new frame

      // write frame and when it's written, ask for next frame
      const buffer = Buffer.from(data.image.split(",")[1], "base64");

      // REVIEW:
      // it is designed to process image and only then request a new frame
      // but, seeing ffmpeg log, there still is some difference between
      // what frame gets sent from client and what frame is being processed by ffmpeg.
      // need to look closer.

      stdin.write(buffer, (err) => {
        if (err) console.error(err);
        return;
      });

      // request next frame only after writing the current frame
      client.send("ssam:ffmpeg-reqframe");

      framesRecorded++;

      // send log to client
      const msg = `recording frame... ${data.frame}`;
      client.send("ssam:log", { msg });
      console.log(msg);
    });

    server.ws.on("ssam:ffmpeg-done", (_, client) => {
      if (!isFfmpegInstalled || !isFfmpegReady) return;

      // finish up recording
      stdin.end();

      // reset state
      isFfmpegReady = false;
      framesRecorded = 0;

      // send log to client
      const msg = "recording complete";
      client.send("ssam:log", { msg });
      console.log(msg);
    });
  },
});

const execPromise = (cmd: string) =>
  new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(stderr);
      resolve(stdout);
    });
  });

const writePromise = (stdin: Writable, buffer: Buffer): Promise<boolean> =>
  new Promise((resolve, reject) => {
    stdin.write(buffer, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
