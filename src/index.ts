// basic example to stream canvas image to ffmpeg and export mp4

// TODO:
// v log ffmpeg stdout, stderr
// - cat *.png | ffmpeg image2pipe (to see if it works without node)
// - create web socket server (w/ot using Vite)
// - look into `stdin.write` how backpressure, cb and drain works
// - try node-ffmpeg-stream package
// - export PNG without ffmpeg (in export plugin)

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d")!;

const width = 7200;
const height = 7200;

canvas.width = width;
canvas.height = height;
canvas.style.width = `${width / 12}px`;
canvas.style.height = `${height / 12}px`;

// sketch variables
let frame = 0;
const fps = 60;
const totalFrames = 2400;
let recording = false;
let newFrameRequested = false;

const prefix = `ssam`;

// client-server communication
if (import.meta.hot) {
  // only send a new frame when requested from plugin
  import.meta.hot.on(`${prefix}:ffmpeg-reqframe`, () => {
    newFrameRequested = true;
    console.log("new frame requested");
  });
  import.meta.hot.on("ssam:log", (data) => {
    console.log(data.msg);
  });
  import.meta.hot.on("ssam:warn", (data) => {
    console.log(data.msg);
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key === "s") {
    if (!recording) {
      // start a new recording
      frame = 0;
      recording = true;

      // set up plugin
      import.meta.hot &&
        import.meta.hot.send(`${prefix}:ffmpeg`, {
          fps,
          totalFrames,
        });
    } else {
      // finish current recording
      import.meta.hot && import.meta.hot.send(`${prefix}:ffmpeg-done`);
      newFrameRequested = false;
      recording = false;
    }
  }
});

// animation loop
animate();

function animate() {
  // canvas drawing
  ctx.fillStyle = `gray`;
  ctx.fillRect(0, 0, width, height);
  ctx.font = `800px monospace`;
  ctx.fillStyle = `black`;
  ctx.fillText(frame.toString(), width / 2, height / 2);

  if (import.meta.hot) {
    if (recording) {
      if (!newFrameRequested) {
        // early return if frame not requested
        window.requestAnimationFrame(animate);
        return;
      }

      // send new frame if requested
      import.meta.hot.send(`${prefix}:ffmpeg-newframe`, {
        image: canvas.toDataURL(),
        frame,
      });

      // set the flag false and wait for next request
      newFrameRequested = false;
      console.log("sent new frame", frame);
    }
  }

  if (frame < totalFrames) {
    frame++;
  } else {
    frame = 0;
    if (recording) {
      recording = false;
      import.meta.hot && import.meta.hot.send(`${prefix}:ffmpeg-done`);
    }
  }
  window.requestAnimationFrame(animate);
}
