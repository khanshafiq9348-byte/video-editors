import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import http from 'http';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const val = args[i + 1];
      result[key] = val;
      i++;
    }
  }
  return result;
}

// Lightweight static file server for high-speed local asset streaming to Chromium
function startLocalMediaServer(rootDir) {
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp3': 'audio/mp3',
    '.wav': 'audio/wav',
    '.m4a': 'audio/m4a',
  };

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const decodedUrl = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(rootDir, decodedUrl.replace(/^\//, ''));

      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        });
        fs.createReadStream(filePath).pipe(res);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`Media server running on http://127.0.0.1:${port}`);
      resolve({
        server,
        port,
        close: () => server.close(),
      });
    });
  });
}

async function run() {
  const args = parseArgs();
  const timelinePath = args.timeline;
  const outputPath = args.output;
  const storageDir = args.storageDir || path.resolve(__dirname, '..', 'storage');

  if (!timelinePath || !outputPath) {
    console.error('Usage: node render.mjs --timeline <path> --output <path>');
    process.exit(1);
  }

  console.log(`Loading timeline from: ${timelinePath}`);
  const rawData = fs.readFileSync(timelinePath, 'utf-8');
  const timeline = JSON.parse(rawData);

  // 1. Start local streaming media server serving storageDir
  const mediaServer = await startLocalMediaServer(storageDir);
  const mediaBaseUrl = `http://127.0.0.1:${mediaServer.port}`;

  const projectAssetsDir = path.join(storageDir, 'projects', timeline.projectId, 'assets');
  
  // Convert local asset filenames into fast streaming HTTP URLs
  const scenesWithHttpUrls = (timeline.scenes || []).map((scene) => {
    let imageUrl = '';
    if (scene.imageAssetId) {
      const files = fs.existsSync(projectAssetsDir) ? fs.readdirSync(projectAssetsDir) : [];
      const match = files.find(f => f.startsWith(scene.imageAssetId));
      if (match) {
        imageUrl = `${mediaBaseUrl}/projects/${timeline.projectId}/assets/${match}`;
      }
    }
    return {
      ...scene,
      imageUrl: imageUrl || scene.imageUrl || '',
    };
  });

  let audioUrl = undefined;
  if (timeline.audio && timeline.audio.assetId) {
    const files = fs.existsSync(projectAssetsDir) ? fs.readdirSync(projectAssetsDir) : [];
    const match = files.find(f => f.startsWith(timeline.audio.assetId));
    if (match) {
      audioUrl = `${mediaBaseUrl}/projects/${timeline.projectId}/assets/${match}`;
    }
  }

  // Support resolution and FPS overrides passed from args or timeline
  const durationInFrames = Math.max(30, timeline.totalDurationFrames || 150);
  const fps = parseInt(args.fps || (timeline.settings && timeline.settings.fps) || 30, 10);
  const width = parseInt(args.width || (timeline.settings && timeline.settings.width) || 1920, 10);
  const height = parseInt(args.height || (timeline.settings && timeline.settings.height) || 1080, 10);

  // High performance concurrency: optimal worker allocation for CPU cores without thrashing
  const numCpus = os.cpus().length || 4;
  const concurrency = Math.max(2, Math.min(6, numCpus));

  // 2. High-speed Bundle Caching: Re-use compiled webpack bundle to eliminate 8-10s startup lag
  const cacheDir = path.resolve(__dirname, '.bundle-cache');
  let bundleLocation = null;
  const srcDir = path.resolve(__dirname, 'src');

  function getLatestMtime(dir) {
    let latest = 0;
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const full = path.join(dir, file.name);
        if (file.isDirectory()) {
          latest = Math.max(latest, getLatestMtime(full));
        } else {
          const stat = fs.statSync(full);
          latest = Math.max(latest, stat.mtimeMs);
        }
      }
    } catch (e) {}
    return latest;
  }

  const bundleMetaPath = path.join(cacheDir, 'meta.json');
  const srcMtime = getLatestMtime(srcDir);
  let canReuseBundle = false;

  if (fs.existsSync(bundleMetaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(bundleMetaPath, 'utf-8'));
      if (meta.mtime === srcMtime && fs.existsSync(meta.bundleLocation)) {
        bundleLocation = meta.bundleLocation;
        canReuseBundle = true;
        console.log(`Using cached Remotion bundle: ${bundleLocation}`);
      }
    } catch (e) {}
  }

  if (!canReuseBundle) {
    console.log(`Bundling Remotion project...`);
    bundleLocation = await bundle({
      entryPoint: path.resolve(__dirname, 'src', 'index.ts'),
      webpackOverride: (config) => config,
    });
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(bundleMetaPath, JSON.stringify({ mtime: srcMtime, bundleLocation }), 'utf-8');
    } catch (e) {}
  }

  console.log(`Bundle ready. Selecting composition AutoVideo...`);
  const inputProps = {
    scenes: scenesWithHttpUrls,
    audioUrl,
    audioStartFrame: (timeline.audio && timeline.audio.startFrame) || 0,
    captions: timeline.captions,
  };

  try {
    // Export Quality presets mapping:
    // Standard (Fast): jpeg 82, crf 22, veryfast x264
    // High (Default): jpeg 86, crf 18 (visually lossless, 2.5x faster capture than 98)
    // Max / Master: jpeg 94, crf 16 (master quality)
    const qualityPreset = args.quality || 'high';
    const isPng = qualityPreset === 'max' || args.imageFormat === 'png';
    const crf = parseInt(args.crf || (qualityPreset === 'max' ? 16 : (qualityPreset === 'standard' ? 22 : 18)), 10);
    const imageFormat = isPng ? 'png' : 'jpeg';
    const jpegQuality = isPng ? undefined : (qualityPreset === 'standard' ? 82 : (qualityPreset === 'max' ? 94 : 86));

    const chromiumArgs = [
      '--force-color-profile=srgb',
      '--disable-web-security',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--enable-zero-copy',
      '--use-gl=angle',
      '--use-angle=d3d11',
      '--enable-accelerated-2d-canvas',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection',
    ];

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'AutoVideo',
      inputProps,
      browserExecutable: null,
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
        gl: 'angle',
        args: chromiumArgs,
      },
    });

    composition.durationInFrames = durationInFrames;
    composition.fps = fps;
    composition.width = width;
    composition.height = height;

    console.log(`Rendering ${durationInFrames} frames at ${fps} FPS (${width}x${height}) using ${concurrency} parallel workers...`);
    console.log(`Settings: format=${imageFormat}${jpegQuality ? `, jpegQuality=${jpegQuality}` : ''}, crf=${crf}, x264Preset=veryfast, hwAccel=if-possible`);

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      concurrency: concurrency,
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
        gl: 'angle',
        args: chromiumArgs,
      },
      imageFormat,
      jpegQuality,
      x264Preset: 'veryfast',
      hardwareAcceleration: 'if-possible',
      audioCodec: 'aac',
      audioBitrate: '256k',
      crf,
      pixelFormat: 'yuv420p',
      scale: 1,
      muted: false,
      disposition: 'default',
      ffmpegOverride: ({ type, args: ffmpegArgs }) => {
        const out = [...ffmpegArgs];
        if (!out.includes('-movflags')) {
          out.push('-movflags', '+faststart');
        }
        return out;
      },
      onProgress: ({ renderedFrames }) => {
        const progress = renderedFrames / durationInFrames;
        console.log(`PROGRESS:${progress.toFixed(3)}`);
      },
    });

    console.log(`Render complete! Output saved to: ${outputPath}`);
  } finally {
    mediaServer.close();
  }
}

run().catch((err) => {
  console.error('Fatal render error:', err);
  process.exit(1);
});
