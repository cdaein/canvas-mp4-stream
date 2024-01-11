import type { PluginOption, ViteDevServer } from "vite";
import { exec, spawn } from "node:child_process";
import { Writable } from "stream";

let isFfmpegInstalled = false;
let isFfmpegReady = false; // ready to receive a new frame?

let format: string;
let framesRecorded = 0;
let totalFrames = 0;

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

    let stdin: Writable;

    // this message is received when client starts a new recording
    server.ws.on("ssam:ffmpeg", async (data, client) => {
      if (!isFfmpegInstalled) {
        const msg = `ffmpeg was not found`;
        client.send("ssam:warn", { msg });
        console.warn(msg);
        return;
      }

      ({ totalFrames } = data);

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

      const command = spawn("ffmpeg", [
        "-y",
        ...inputArgs,
        ...outputArgs,
        `./out.mp4`,
      ]);

      // get stdin from ffmpeg process
      ({ stdin } = command);

      isFfmpegReady = true;

      // set is ready, request a frame
      client.send("ssam:ffmpeg-reqframe");
    });

    server.ws.on("ssam:ffmpeg-newframe", async (data, client) => {
      if (!isFfmpegInstalled || !isFfmpegReady) return;

      // record a new frame

      // write frame and when it's written, ask for next frame
      const buffer = Buffer.from(data.image.split(",")[1], "base64");

      // FIX: when exporting large/long video (4k 60fps),
      // stdin.write() stops being called after 10-15 seconds.
      // when logged, buffer is received correctly,
      // can go into writePromise, but it never gets inside stdin.write()
      // - is it because stdin is overwhelmed by incoming data?
      try {
        const written = await writePromise(stdin, buffer);

        if (written) {
          // request next frame only after writing the current frame
          client.send("ssam:ffmpeg-reqframe");

          framesRecorded++;
          // send log to client
          const msg = `recording frame... ${data.frame}`;
          client.send("ssam:log", { msg });
          console.log(msg);
        }
      } catch (e) {
        console.error(e);
      }
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
