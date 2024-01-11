# Canvas to mp4 video

A barebone minimal example of saving HTML5 Canvas to mp4 video using ffmpeg process via Vite dev server plugin (Node.js). It can handle very high resolution canvas (tested up to 7k resolution). There is no dependency other than using Vitejs server and having ffmpeg installed.

The same technique is used in [Ssam](https://github.com/cdaein/ssam) creative coding helper package.

## Notes

It is not yet perfect. I've noticed some difference between the frame being processed by ffmpeg and the frame that is being sent from the client.

# License

MIT
