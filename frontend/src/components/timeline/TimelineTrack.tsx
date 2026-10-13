import React, { useRef, useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, Scissors, Trash2, Wand2, Magnet, Clock, Type, Copy } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';

export const TimelineTrack: React.FC = () => {
  const {
    timeline,
    currentProject,
    waveform,
    selectedSceneId,
    selectedCaptionId,
    currentFrame,
    zoomLevel,
    setSelectedSceneId,
    setSelectedCaptionId,
    setCurrentFrame,
    setZoomLevel,
    splitScene,
    deleteScene,
    updateScene,
    updateCaptionSegment,
    splitCaptionSegment,
    deleteCaptionSegment,
    autoGenerateTimeline,
  } = useEditorStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<{
    id: string;
    targetType: 'scene' | 'caption';
    edge: 'left' | 'right';
    startX: number;
    initialStartFrame: number;
    initialDurationFrames: number;
    initialEndFrame: number;
  } | null>(null);

  if (!timeline) return null;

  const fps = timeline.settings.fps || 30;
  const totalSeconds = Math.max(10, Math.ceil(timeline.totalDurationFrames / fps));
  const pixelsPerSecond = zoomLevel;
  const pixelsPerFrame = pixelsPerSecond / fps;
  const totalTimelineWidth = Math.max(800, totalSeconds * pixelsPerSecond);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || resizing) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + containerRef.current.scrollLeft;
    const targetFrame = Math.round(clickX / pixelsPerFrame);
    setCurrentFrame(Math.max(0, Math.min(timeline.totalDurationFrames, targetFrame)));
  };

  const handleSplitCurrent = () => {
    if (selectedCaptionId) {
      splitCaptionSegment(selectedCaptionId, currentFrame);
    } else if (selectedSceneId) {
      splitScene(selectedSceneId, currentFrame);
    }
  };

  const handleDeleteCurrent = () => {
    if (selectedCaptionId) {
      deleteCaptionSegment(selectedCaptionId);
    } else if (selectedSceneId) {
      deleteScene(selectedSceneId);
    }
  };

  // Snap clip boundary to aligned sentence timestamps
  const handleSnapToSentence = () => {
    if (!selectedSceneId || !currentProject?.sentences || !timeline) return;
    const scene = timeline.scenes.find((s) => s.id === selectedSceneId);
    if (!scene) return;

    const sortedSents = [...currentProject.sentences].sort((a, b) => a.start_time - b.start_time);
    const sentIdx = sortedSents.findIndex((s) => s.id === scene.sentenceId);
    const sent = sentIdx !== -1 ? sortedSents[sentIdx] :
                 sortedSents.find((s) => Math.abs(s.start_time * fps - scene.startFrame) < fps * 4);
    
    if (sent) {
      const idx = sortedSents.findIndex((s) => s.id === sent.id);
      const newStartFrame = Math.round(sent.start_time * fps);
      let newEndFrame = Math.round(sent.end_time * fps);

      // Clip transitions to next clip when next sentence starts
      if (idx !== -1 && idx < sortedSents.length - 1) {
        newEndFrame = Math.max(newEndFrame, Math.round(sortedSents[idx + 1].start_time * fps));
      } else if (timeline.totalDurationFrames > newEndFrame) {
        newEndFrame = timeline.totalDurationFrames;
      }

      updateScene(scene.id, {
        startFrame: newStartFrame,
        durationFrames: Math.max(1, newEndFrame - newStartFrame),
      });
      setCurrentFrame(newStartFrame);
    }
  };

  // Mouse drag handler for resizing clip edges
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing) return;
      const deltaX = e.clientX - resizing.startX;
      const deltaFrames = Math.round(deltaX / pixelsPerFrame);

      if (resizing.targetType === 'scene') {
        if (resizing.edge === 'right') {
          const newDuration = Math.max(15, resizing.initialDurationFrames + deltaFrames);
          updateScene(resizing.id, { durationFrames: newDuration });
        } else if (resizing.edge === 'left') {
          const potentialStart = resizing.initialStartFrame + deltaFrames;
          const potentialDuration = resizing.initialDurationFrames - deltaFrames;
          if (potentialDuration >= 15 && potentialStart >= 0) {
            updateScene(resizing.id, {
              startFrame: potentialStart,
              durationFrames: potentialDuration,
            });
          }
        }
      } else if (resizing.targetType === 'caption') {
        if (resizing.edge === 'right') {
          const newEnd = Math.max(resizing.initialStartFrame + 5, resizing.initialEndFrame + deltaFrames);
          updateCaptionSegment(resizing.id, { endFrame: newEnd });
        } else if (resizing.edge === 'left') {
          const newStart = Math.max(0, Math.min(resizing.initialEndFrame - 5, resizing.initialStartFrame + deltaFrames));
          updateCaptionSegment(resizing.id, { startFrame: newStart });
        }
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    if (resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, pixelsPerFrame]);

  // Auto-Fix Gaps: bridge gaps without shifting clip start frames
  const handleAutoFixGaps = () => {
    if (!timeline || timeline.scenes.length === 0) return;
    const sorted = [...timeline.scenes].sort((a, b) => a.startFrame - b.startFrame);
    const fixedScenes = sorted.map((s, idx) => {
      const isLast = idx === sorted.length - 1;
      let durationFrames = s.durationFrames;
      if (!isLast) {
        const nextStart = sorted[idx + 1].startFrame;
        durationFrames = Math.max(1, nextStart - s.startFrame);
      } else if (timeline.totalDurationFrames > s.startFrame) {
        durationFrames = Math.max(1, timeline.totalDurationFrames - s.startFrame);
      }
      return {
        ...s,
        durationFrames,
      };
    });

    useEditorStore.getState().setTimeline({
      ...timeline,
      scenes: fixedScenes,
    }, true);
  };

  return (
    <div className="flex-1 w-full bg-[#11131a] border-t border-[#2A2F3A] flex flex-col select-none min-h-0">
      {/* Timeline Controls Header */}
      <div className="h-10 border-b border-[#2A2F3A] px-4 flex items-center justify-between bg-[#181B24]">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSplitCurrent}
            disabled={!selectedSceneId && !selectedCaptionId}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#232733] hover:bg-[#2e3343] disabled:opacity-40 disabled:hover:bg-[#232733] rounded text-xs font-medium text-gray-200 border border-[#343a49] transition-colors"
            title="Split selected scene or caption at playhead (Scissors)"
          >
            <Scissors size={14} className="text-amber-400" /> Split Clip
          </button>

          <button
            onClick={handleSnapToSentence}
            disabled={!selectedSceneId}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#232733] hover:bg-emerald-950/40 hover:text-emerald-300 disabled:opacity-40 disabled:hover:bg-[#232733] rounded text-xs font-medium text-gray-200 border border-[#343a49] transition-colors"
            title="Snap this clip boundary to its detected sentence start & end"
          >
            <Magnet size={14} className="text-emerald-400" /> Snap to Sentence
          </button>

          <button
            onClick={handleDeleteCurrent}
            disabled={!selectedSceneId && !selectedCaptionId}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#232733] hover:bg-red-950/40 hover:text-red-300 disabled:opacity-40 disabled:hover:bg-[#232733] rounded text-xs font-medium text-gray-200 border border-[#343a49] transition-colors"
            title="Delete selected scene or caption clip"
          >
            <Trash2 size={14} className="text-red-400" /> Delete
          </button>

          <div className="h-4 w-[1px] bg-[#2A2F3A] mx-1" />

          <button
            onClick={autoGenerateTimeline}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#232733] hover:bg-indigo-950/50 hover:text-indigo-300 rounded text-xs font-medium text-indigo-400 border border-indigo-900/50 transition-colors"
            title="Re-align all visual clips to sentences"
          >
            <Wand2 size={13} /> Re-Align All
          </button>

          <button
            onClick={handleAutoFixGaps}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#232733] hover:bg-emerald-950/50 hover:text-emerald-300 rounded text-xs font-medium text-emerald-400 border border-emerald-900/50 transition-colors"
            title="Eliminate gaps and extend coverage across entire audio"
          >
            <Clock size={13} /> Auto-Fix Gaps
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Zoom</span>
          <button
            onClick={() => setZoomLevel(zoomLevel - 15)}
            className="p-1 hover:text-white rounded hover:bg-[#232733]"
          >
            <ZoomOut size={14} />
          </button>
          <input
            type="range"
            min={15}
            max={150}
            value={zoomLevel}
            onChange={(e) => setZoomLevel(parseInt(e.target.value, 10))}
            className="w-24 accent-indigo-500"
          />
          <button
            onClick={() => setZoomLevel(zoomLevel + 15)}
            className="p-1 hover:text-white rounded hover:bg-[#232733]"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      {/* Multitrack Scrollable Area */}
      <div
        ref={containerRef}
        onClick={handleTimelineClick}
        className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#0e1017] cursor-pointer"
      >
        <div style={{ width: `${totalTimelineWidth}px` }} className="relative h-full flex flex-col pt-6 pb-2">
          {/* Time Ruler (Seconds markers) */}
          <div className="absolute top-0 left-0 right-0 h-6 border-b border-[#222634] flex items-end">
            {Array.from({ length: totalSeconds + 1 }).map((_, sec) => (
              <div
                key={sec}
                style={{ left: `${sec * pixelsPerSecond}px` }}
                className="absolute text-[10px] text-gray-500 font-mono pl-1 border-l border-gray-700 h-3"
              >
                {sec}s
              </div>
            ))}
          </div>

          {/* Track 1: Visual Image Clips */}
          <div className="h-16 relative bg-[#141722]/60 my-1 border-y border-[#1e2333]">
            {(Array.isArray(timeline.scenes) ? timeline.scenes : []).map((scene) => {
              const asset = Array.isArray(currentProject?.assets) ? currentProject.assets.find((a) => a.id === scene.imageAssetId) : undefined;
              const isSelected = scene.id === selectedSceneId;
              const left = scene.startFrame * pixelsPerFrame;
              const width = Math.max(20, scene.durationFrames * pixelsPerFrame);

              return (
                <div
                  key={scene.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSceneId(scene.id);
                  }}
                  style={{
                    left: `${left}px`,
                    width: `${width}px`,
                  }}
                  className={`absolute top-1 bottom-1 rounded-md overflow-hidden border flex items-center transition-all cursor-pointer select-none group ${
                    isSelected
                      ? 'border-indigo-400 bg-indigo-950/80 ring-2 ring-indigo-500/50 z-10'
                      : 'border-[#2d3448] bg-[#1a1e2b] hover:border-gray-500'
                  }`}
                >
                  {/* Left Resize Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setResizing({
                        id: scene.id,
                        targetType: 'scene',
                        edge: 'left',
                        startX: e.clientX,
                        initialStartFrame: scene.startFrame,
                        initialDurationFrames: scene.durationFrames,
                        initialEndFrame: scene.startFrame + scene.durationFrames,
                      });
                    }}
                    className="absolute left-0 top-0 bottom-0 w-2 hover:w-3 cursor-ew-resize bg-indigo-500/0 hover:bg-indigo-500/60 transition-all z-20"
                    title="Drag to trim start"
                  />

                  {/* Thumbnail snippet */}
                  {asset && (
                    <img
                      src={asset.url}
                      alt=""
                      className="w-12 h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity pointer-events-none"
                    />
                  )}
                  <div className="flex-1 px-2 truncate pointer-events-none">
                    <span className="text-[11px] font-medium text-gray-200 block truncate">
                      {asset?.original_name || scene.id}
                    </span>
                    <span className="text-[9px] text-indigo-300 font-mono">
                      {scene.effect.type} · {(scene.durationFrames / fps).toFixed(1)}s
                    </span>
                  </div>

                  {/* Transition indicator pill */}
                  {scene.transitionOut && (
                    <div
                      title={`Transition: ${scene.transitionOut.type}`}
                      className="absolute right-0 top-0 bottom-0 w-3 bg-purple-600/60 border-l border-purple-400 pointer-events-none"
                    />
                  )}

                  {/* Right Resize Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setResizing({
                        id: scene.id,
                        targetType: 'scene',
                        edge: 'right',
                        startX: e.clientX,
                        initialStartFrame: scene.startFrame,
                        initialDurationFrames: scene.durationFrames,
                        initialEndFrame: scene.startFrame + scene.durationFrames,
                      });
                    }}
                    className="absolute right-0 top-0 bottom-0 w-2 hover:w-3 cursor-ew-resize bg-indigo-500/0 hover:bg-indigo-500/60 transition-all z-20"
                    title="Drag to trim end"
                  />
                </div>
              );
            })}
          </div>

          {/* Track 2: Dedicated Caption Track */}
          <div className="h-10 relative bg-[#141122]/90 my-1 border-y border-[#261E38] flex items-center">
            {timeline.captions?.segments && timeline.captions.segments.length > 0 ? (
              timeline.captions.segments.map((seg) => {
                const isSelected = seg.id === selectedCaptionId;
                const left = seg.startFrame * pixelsPerFrame;
                const width = Math.max(24, (seg.endFrame - seg.startFrame) * pixelsPerFrame);

                return (
                  <div
                    key={seg.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCaptionId(seg.id);
                      setSelectedSceneId(null);
                      setCurrentFrame(seg.startFrame);
                    }}
                    style={{
                      left: `${left}px`,
                      width: `${width}px`,
                    }}
                    title={`[${(seg.startFrame / fps).toFixed(2)}s - ${(seg.endFrame / fps).toFixed(2)}s] ${seg.text}`}
                    className={`absolute top-1 bottom-1 rounded overflow-hidden border flex items-center transition-all cursor-pointer select-none group px-1 ${
                      isSelected
                        ? 'border-purple-400 bg-purple-950/90 ring-2 ring-purple-500/60 z-20'
                        : 'border-[#3D2E5C] bg-[#221B35] hover:border-purple-400 hover:bg-[#2C2245]'
                    }`}
                  >
                    {/* Left Resize Handle */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setResizing({
                          id: seg.id,
                          targetType: 'caption',
                          edge: 'left',
                          startX: e.clientX,
                          initialStartFrame: seg.startFrame,
                          initialDurationFrames: seg.endFrame - seg.startFrame,
                          initialEndFrame: seg.endFrame,
                        });
                      }}
                      className="absolute left-0 top-0 bottom-0 w-2 hover:w-3 cursor-ew-resize bg-purple-500/0 hover:bg-purple-500/80 transition-all z-20"
                      title="Drag to trim caption start"
                    />

                    <div className="flex-1 truncate pointer-events-none flex items-center gap-1.5 px-1">
                      <Type size={11} className="text-purple-400 shrink-0" />
                      <span className="text-[10px] font-medium text-purple-200 truncate">
                        {seg.text}
                      </span>
                    </div>

                    {/* Right Resize Handle */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setResizing({
                          id: seg.id,
                          targetType: 'caption',
                          edge: 'right',
                          startX: e.clientX,
                          initialStartFrame: seg.startFrame,
                          initialDurationFrames: seg.endFrame - seg.startFrame,
                          initialEndFrame: seg.endFrame,
                        });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-2 hover:w-3 cursor-ew-resize bg-purple-500/0 hover:bg-purple-500/80 transition-all z-20"
                      title="Drag to trim caption end"
                    />
                  </div>
                );
              })
            ) : (
              <div className="px-3 text-[10px] text-gray-500 italic pointer-events-none">
                Captions track (Click "Generate Automatic Captions" in Captions tab to populate)
              </div>
            )}
          </div>

          {/* Track 2: Sentences Track */}
          <div className="h-10 relative bg-[#131620] my-1 border-y border-[#1c202e] flex items-center">
            {(currentProject?.sentences || []).map((sent) => {
              const left = (sent.start_time * fps) * pixelsPerFrame;
              const width = Math.max(20, (sent.end_time - sent.start_time) * fps * pixelsPerFrame);

              return (
                <div
                  key={sent.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Clicking sentence seeks playhead and selects aligned scene
                    setCurrentFrame(Math.round(sent.start_time * fps));
                    const matchingScene = timeline.scenes.find((s) => s.sentenceId === sent.id);
                    if (matchingScene) {
                      setSelectedSceneId(matchingScene.id);
                    }
                  }}
                  style={{
                    left: `${left}px`,
                    width: `${width}px`,
                  }}
                  title={`[${sent.start_time.toFixed(1)}s - ${sent.end_time.toFixed(1)}s] ${sent.text}`}
                  className="absolute top-1 bottom-1 bg-[#1e293b]/70 border border-emerald-600/40 hover:border-emerald-400 hover:bg-emerald-950/40 rounded px-2 flex items-center overflow-hidden cursor-pointer transition-colors"
                >
                  <span className="text-[10px] text-emerald-300 truncate font-mono">
                    "{sent.text}"
                  </span>
                </div>
              );
            })}
          </div>

          {/* Track 3: Audio Waveform Track */}
          <div className="h-12 relative bg-[#10131c] my-1 border-y border-[#181c28] flex items-center px-1">
            {waveform.length > 0 && (
              <svg
                width={totalTimelineWidth}
                height="36"
                className="opacity-70 pointer-events-none"
              >
                {waveform.map((val, idx) => {
                  const barW = Math.max(2, totalTimelineWidth / waveform.length - 1);
                  const barH = Math.max(2, val * 32);
                  const x = idx * (totalTimelineWidth / waveform.length);
                  const y = (36 - barH) / 2;
                  return (
                    <rect
                      key={idx}
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      fill="#10b981"
                      rx="1"
                    />
                  );
                })}
              </svg>
            )}
          </div>

          {/* Draggable Playhead */}
          <div
            style={{ left: `${currentFrame * pixelsPerFrame}px` }}
            className="absolute top-0 bottom-0 w-[2px] bg-red-500 pointer-events-none z-30"
          >
            <div className="w-3 h-3 bg-red-500 rounded-full -ml-[5px] -mt-1 shadow-md" />
          </div>
        </div>
      </div>
    </div>
  );
};
