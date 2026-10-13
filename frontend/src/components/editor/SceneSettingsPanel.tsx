import React from 'react';
import { Sliders, Sparkles, Layers, RefreshCw } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';

export const SceneSettingsPanel: React.FC = () => {
  const { timeline, selectedSceneId, currentProject, updateScene } = useEditorStore();

  if (!timeline || !selectedSceneId) {
    return (
      <div className="w-80 bg-[#181B24] border-l border-[#2A2F3A] p-6 text-gray-500 text-xs flex flex-col items-center justify-center text-center">
        <Sliders size={28} className="mb-2 text-gray-600" />
        Select a scene clip on the timeline to edit its Ken Burns effect and transition.
      </div>
    );
  }

  const scene = timeline.scenes.find((s) => s.id === selectedSceneId);
  if (!scene) return null;

  const assetsList = Array.isArray(currentProject?.assets) ? currentProject.assets : [];
  const sentencesList = Array.isArray(currentProject?.sentences) ? currentProject.sentences : [];
  const currentImage = assetsList.find((a) => a.id === scene.imageAssetId);
  const availableImages = assetsList.filter((a) => a.type === 'image');
  const associatedSentence = sentencesList.find((s) => s.id === scene.sentenceId);

  const effectOptions = [
    { value: 'zoom_in', label: 'Zoom In' },
    { value: 'zoom_out', label: 'Zoom Out' },
    { value: 'pan_left', label: 'Pan Left' },
    { value: 'pan_right', label: 'Pan Right' },
    { value: 'pan_up', label: 'Pan Up' },
    { value: 'pan_down', label: 'Pan Down' },
    { value: 'zoom_pan', label: 'Zoom + Pan' },
    { value: 'static', label: 'Static (None)' },
  ];

  const transitionOptions = [
    { value: 'cut', label: 'Cut (Instant)' },
    { value: 'crossfade', label: 'Crossfade / Dissolve' },
    { value: 'fade', label: 'Fade to Black' },
    { value: 'slide_left', label: 'Slide Left' },
    { value: 'slide_right', label: 'Slide Right' },
    { value: 'zoom', label: 'Zoom Transition' },
  ];

  return (
    <div className="w-80 bg-[#181B24] border-l border-[#2A2F3A] flex flex-col h-full select-none overflow-y-auto">
      <div className="p-4 border-b border-[#2A2F3A] flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Scene Settings</h2>
        <span className="text-[11px] font-mono text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">
          {scene.id.split('_')[0]}
        </span>
      </div>

      <div className="p-4 space-y-6">
        {/* Assigned Image Thumbnail & Replacement */}
        <div>
          <label className="text-xs font-semibold text-gray-400 mb-2 block">Assigned Image</label>
          <div className="space-y-2">
            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-[#2e3343]">
              {currentImage ? (
                <img src={currentImage.url} alt="Current scene" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">No Image</div>
              )}
            </div>

            <select
              value={scene.imageAssetId}
              onChange={(e) => updateScene(scene.id, { imageAssetId: e.target.value })}
              className="w-full bg-[#11131a] border border-[#2e3343] rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              {availableImages.map((img) => (
                <option key={img.id} value={img.id}>
                  {img.original_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Associated Sentence */}
        {associatedSentence && (
          <div className="p-3 bg-[#11131a] rounded-lg border border-[#2e3343]">
            <span className="text-[10px] uppercase font-semibold text-emerald-400 block mb-1">Aligned Sentence</span>
            <p className="text-xs text-gray-300 italic">"{associatedSentence.text}"</p>
          </div>
        )}

        {/* Timing Information */}
        <div className="p-3 bg-[#11131a] rounded-lg border border-[#2e3343] space-y-2.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] text-gray-500 block mb-1">Start Frame</span>
              <input
                type="number"
                min={0}
                value={scene.startFrame}
                onChange={(e) => {
                  const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                  updateScene(scene.id, { startFrame: val });
                }}
                className="w-full bg-[#181B24] border border-[#2e3343] rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-500 block mb-1">Duration (Frames)</span>
              <input
                type="number"
                min={15}
                value={scene.durationFrames}
                onChange={(e) => {
                  const val = Math.max(15, parseInt(e.target.value, 10) || 15);
                  updateScene(scene.id, { durationFrames: val });
                }}
                className="w-full bg-[#181B24] border border-[#2e3343] rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {associatedSentence && (
            <button
              onClick={() => {
                const fps = timeline.settings.fps || 30;
                const newStart = Math.round(associatedSentence.start_time * fps);
                const newDur = Math.max(1, Math.round((associatedSentence.end_time - associatedSentence.start_time) * fps));
                updateScene(scene.id, {
                  startFrame: newStart,
                  durationFrames: newDur,
                });
              }}
              className="w-full py-1.5 px-2 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 rounded text-[11px] font-medium text-emerald-400 transition-colors flex items-center justify-center gap-1.5"
            >
              Align to Sentence ({associatedSentence.start_time.toFixed(1)}s - {associatedSentence.end_time.toFixed(1)}s)
            </button>
          )}
        </div>

        {/* Fit Mode for Aspect Ratio and Black Bars */}
        <div>
          <label className="text-xs font-semibold text-gray-400 mb-2 flex items-center justify-between">
            <span>Aspect Ratio & Fit Mode</span>
            <span className="text-[10px] text-indigo-400">Fixes Black Bars</span>
          </label>
          <div className="grid grid-cols-3 gap-1.5 bg-[#11131a] p-1 rounded-lg border border-[#2e3343]">
            {[
              { id: 'fill', label: 'Crop (Fill)' },
              { id: 'fit', label: 'Fit (Bars)' },
              { id: 'blur_background', label: 'Blur BG' },
            ].map((mode) => {
              const active = (scene.fitMode || 'fill') === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => updateScene(scene.id, { fitMode: mode.id as any })}
                  className={`py-1.5 px-1 text-[11px] font-medium rounded transition-all ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#181B24]'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
          <span className="text-[10px] text-gray-500 mt-1 block">
            {(scene.fitMode || 'fill') === 'blur_background'
              ? 'Enlarged blurred background fills canvas behind image (CapCut style)'
              : (scene.fitMode === 'fit' ? 'Preserves full image with letterbox bars' : 'Scales to cover full 16:9 canvas')}
          </span>
        </div>

        {/* Color Tone Grade */}
        <div>
          <label className="text-xs font-semibold text-gray-400 mb-2 flex items-center justify-between">
            <span>Color Profile / Tone</span>
            <span className="text-[10px] text-gray-400">Strict sRGB Original</span>
          </label>
          <select
            value={scene.colorTone || 'original'}
            onChange={(e) => updateScene(scene.id, { colorTone: e.target.value as any })}
            className="w-full bg-[#11131a] border border-[#2e3343] rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="original">Original (Strict Neutral / sRGB)</option>
            <option value="cinematic">Cinematic (Enhanced Contrast)</option>
            <option value="cool">Cool Tone (Crisp Blue Accent)</option>
            <option value="warm">Warm Tone (Subtle Golden)</option>
          </select>
        </div>

        {/* Animation Effect */}
        <div>
          <label className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">
            <Sparkles size={14} className="text-indigo-400" />
            Animation Effect
          </label>
          <select
            value={scene.effect.type}
            onChange={(e) => {
              const val = e.target.value;
              updateScene(scene.id, {
                effect: {
                  ...scene.effect,
                  type: val,
                  startScale: val === 'zoom_in' ? 1.0 : (val === 'zoom_out' ? 1.2 : 1.05),
                  endScale: val === 'zoom_in' ? 1.2 : (val === 'zoom_out' ? 1.0 : 1.05),
                  startX: val === 'pan_left' ? 30 : (val === 'pan_right' ? -30 : 0),
                  endX: val === 'pan_left' ? -30 : (val === 'pan_right' ? 30 : 0),
                },
              });
            }}
            className="w-full bg-[#11131a] border border-[#2e3343] rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
          >
            {effectOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Transition Out */}
        <div>
          <label className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">
            <Layers size={14} className="text-purple-400" />
            Out Transition
          </label>
          <div className="space-y-2">
            <select
              value={scene.transitionOut?.type || 'crossfade'}
              onChange={(e) => {
                updateScene(scene.id, {
                  transitionOut: {
                    type: e.target.value,
                    durationFrames: scene.transitionOut?.durationFrames || 12,
                  },
                });
              }}
              className="w-full bg-[#11131a] border border-[#2e3343] rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              {transitionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
              <span>Transition Length</span>
              <span className="font-mono text-gray-300">
                {scene.transitionOut?.durationFrames || 12} frames
              </span>
            </div>
            <input
              type="range"
              min={4}
              max={24}
              value={scene.transitionOut?.durationFrames || 12}
              onChange={(e) => {
                updateScene(scene.id, {
                  transitionOut: {
                    type: scene.transitionOut?.type || 'crossfade',
                    durationFrames: parseInt(e.target.value, 10),
                  },
                });
              }}
              className="w-full accent-indigo-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
