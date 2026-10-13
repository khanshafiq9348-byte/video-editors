import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Play, Pause, SkipBack, SkipForward, Maximize2, Minimize2 } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { AutoVideoComposition } from '../../remotion_shared/compositions/AutoVideo';

export const PreviewPlayer: React.FC = () => {
  const { timeline, currentProject, isPlaying, currentFrame, setIsPlaying, setCurrentFrame } = useEditorStore();
  const playerRef = useRef<PlayerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Local frame state to avoid re-rendering entire parent tree every frame
  const [localFrame, setLocalFrame] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fps = timeline?.settings?.fps || 30;
  const durationInFrames = Math.max(30, timeline?.totalDurationFrames || 150);
  const width = timeline?.settings?.width || 1920;
  const height = timeline?.settings?.height || 1080;

  // Memoize scene mapping so reference stays identical unless timeline or project changes
  const scenesWithUrls = useMemo(() => {
    const scenesList = Array.isArray(timeline?.scenes) ? timeline.scenes : [];
    const assetsList = Array.isArray(currentProject?.assets) ? currentProject.assets : [];
    return scenesList.map((scene) => {
      const asset = assetsList.find((a) => a.id === scene.imageAssetId);
      return {
        ...scene,
        imageUrl: asset ? asset.url : '',
      };
    });
  }, [timeline?.scenes, currentProject?.assets]);

  const audioAsset = useMemo(() => {
    const assetsList = Array.isArray(currentProject?.assets) ? currentProject.assets : [];
    return assetsList.find((a) => a.type === 'audio');
  }, [currentProject?.assets]);
  
  const audioUrl = audioAsset ? audioAsset.url : undefined;

  // Memoize inputProps so Player NEVER remounts or restarts Audio element on frame ticks
  const inputProps = useMemo(() => {
    return {
      scenes: scenesWithUrls,
      audioUrl: audioUrl,
      audioStartFrame: timeline?.audio?.startFrame || 0,
      captions: timeline?.captions,
    };
  }, [scenesWithUrls, audioUrl, timeline?.audio?.startFrame, timeline?.captions]);

  // Bi-directional synchronization: when currentFrame changes externally (e.g. clicking/scrubbing timeline or snapping),
  // seek the player and update localFrame immediately.
  useEffect(() => {
    if (!playerRef.current) return;
    const currentActualFrame = playerRef.current.getCurrentFrame();
    // Only seek if external currentFrame differs by more than 2 frames from internal frame
    if (Math.abs(currentActualFrame - currentFrame) > 2) {
      playerRef.current.seekTo(currentFrame);
      setLocalFrame(currentFrame);
    }
  }, [currentFrame]);

  useEffect(() => {
    const current = playerRef.current;
    if (!current) return;

    let lastSyncTime = 0;
    const handleFrame = (e: { detail: { frame: number } }) => {
      const f = e.detail.frame;
      setLocalFrame(f);

      // Throttle syncing with global store to ~10fps so timeline playhead moves smoothly
      // without causing 30-60 React re-renders per second that stutter Web Audio
      const now = performance.now();
      if (now - lastSyncTime > 90) {
        lastSyncTime = now;
        setCurrentFrame(f);
      }
    };

    // @ts-ignore
    current.addEventListener('frameupdate', handleFrame);
    return () => {
      // @ts-ignore
      current.removeEventListener('frameupdate', handleFrame);
    };
  }, [playerRef.current]);

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
      setIsPlaying(false);
    } else {
      playerRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekToTarget = (target: number) => {
    if (!playerRef.current) return;
    const bounded = Math.max(0, Math.min(durationInFrames - 1, target));
    playerRef.current.seekTo(bounded);
    setLocalFrame(bounded);
    setCurrentFrame(bounded);
  };

  const stepForward = () => {
    seekToTarget(localFrame + 1);
  };

  const stepBackward = () => {
    seekToTarget(localFrame - 1);
  };

  const jumpBackward5s = () => {
    seekToTarget(localFrame - fps * 5);
  };

  const jumpForward5s = () => {
    seekToTarget(localFrame + fps * 5);
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const frame = parseInt(e.target.value, 10);
    seekToTarget(frame);
  };

  const formatTime = (frame: number) => {
    const totalSecs = frame / fps;
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    const ms = Math.floor((totalSecs % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex flex-col bg-[#0b0d13] items-center justify-between p-3 relative overflow-hidden select-none ${
        isFullscreen ? 'fixed inset-0 z-50 p-6 bg-black' : 'h-full'
      }`}
    >
      {/* Video Canvas Container - dynamically fills available flex height */}
      <div className="flex-1 w-full flex items-center justify-center min-h-0 py-2">
        <div
          className="relative bg-black rounded-lg overflow-hidden shadow-2xl border border-[#2A2F3A] flex items-center justify-center max-w-full"
          style={{
            aspectRatio: `${width} / ${height}`,
            maxHeight: '100%',
            maxWidth: '100%',
            height: '100%',
          }}
        >
          {timeline && scenesWithUrls.length > 0 ? (
            <Player
              ref={playerRef}
              component={AutoVideoComposition as any}
              durationInFrames={durationInFrames}
              fps={fps}
              compositionWidth={width}
              compositionHeight={height}
              style={{
                width: '100%',
                height: '100%',
              }}
              inputProps={inputProps}
              controls={false}
              autoPlay={false}
              loop
            />
          ) : (
            <div className="text-center p-6 text-gray-500">
              <div className="text-sm font-medium mb-1">No Scenes Generated</div>
              <div className="text-xs text-gray-600">
                Upload images and audio, then click "Auto Generate"
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scrubber Bar directly under preview */}
      <div className="w-full max-w-5xl px-2">
        <input
          type="range"
          min={0}
          max={Math.max(1, durationInFrames - 1)}
          value={localFrame}
          onChange={handleScrubberChange}
          className="w-full h-1.5 bg-[#232733] accent-indigo-500 rounded-lg appearance-none cursor-pointer focus:outline-none"
        />
      </div>

      {/* Control Bar */}
      <div className="w-full max-w-5xl mt-2 flex items-center justify-between bg-[#181B24] border border-[#2A2F3A] rounded-lg px-4 py-2 text-gray-300">
        <div className="flex items-center gap-2">
          {/* Reverse / Jump back 5s button */}
          <button
            onClick={jumpBackward5s}
            className="px-2 py-1 text-xs font-semibold bg-[#232733] hover:bg-[#2e3444] text-gray-300 hover:text-white rounded transition-colors flex items-center gap-1"
            title="Reverse 5 seconds (-5s)"
          >
            -5s
          </button>
          {/* Step back 1 frame button */}
          <button
            onClick={stepBackward}
            className="p-1.5 hover:text-white hover:bg-[#232733] rounded transition-colors"
            title="Step back 1 frame"
          >
            <SkipBack size={16} />
          </button>
          {/* Play / Pause button */}
          <button
            onClick={togglePlay}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors shadow-sm"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          {/* Step forward 1 frame button */}
          <button
            onClick={stepForward}
            className="p-1.5 hover:text-white hover:bg-[#232733] rounded transition-colors"
            title="Step forward 1 frame"
          >
            <SkipForward size={16} />
          </button>
          {/* Jump forward 5s button */}
          <button
            onClick={jumpForward5s}
            className="px-2 py-1 text-xs font-semibold bg-[#232733] hover:bg-[#2e3444] text-gray-300 hover:text-white rounded transition-colors flex items-center gap-1"
            title="Forward 5 seconds (+5s)"
          >
            +5s
          </button>

          <span className="text-xs font-mono text-gray-400 ml-3">
            {formatTime(localFrame)} / {formatTime(durationInFrames)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-gray-500 hidden sm:flex items-center gap-4">
            <span>Frame: {localFrame} / {durationInFrames}</span>
            <span>{fps} FPS</span>
            <span>{width}x{height}</span>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 hover:text-white hover:bg-[#232733] rounded transition-colors text-gray-400"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Preview'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};
