import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Download,
  RotateCcw,
  RotateCw,
  Save,
  Wand2,
  Loader2,
  Film,
  SlidersHorizontal,
  X,
  Check,
  Activity,
  Clock,
  Type,
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { useExportStore } from '../../stores/exportStore';
import { ExportManagerDrawer } from '../export/ExportManagerDrawer';
import { api } from '../../services/api';
import { triggerBrowserDownload } from '../../utils/downloadHelper';

export interface ResolutionPreset {
  id: string;
  label: string;
  ratio: '16:9' | '9:16' | '1:1';
  width: number;
  height: number;
  desc: string;
}

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  // 16:9 Landscape
  { id: '1080p_land', label: '1080p Full HD', ratio: '16:9', width: 1920, height: 1080, desc: 'YouTube, Desktop & Widescreen (1920×1080)' },
  { id: '720p_land', label: '720p HD', ratio: '16:9', width: 1280, height: 720, desc: 'Faster export, Web (1280×720)' },
  { id: '4k_land', label: '4K Ultra HD', ratio: '16:9', width: 3840, height: 2160, desc: 'Highest Quality (3840×2160)' },
  // 9:16 Vertical
  { id: '1080p_vert', label: '1080p Full HD', ratio: '9:16', width: 1080, height: 1920, desc: 'TikTok, Reels, Shorts (1080×1920)' },
  { id: '720p_vert', label: '720p HD', ratio: '9:16', width: 720, height: 1280, desc: 'Shorts, Stories (720×1280)' },
  // 1:1 Square
  { id: '1080p_sq', label: '1080p Square', ratio: '1:1', width: 1080, height: 1080, desc: 'Instagram Feed, Square (1080×1080)' },
  { id: '720p_sq', label: '720p Square', ratio: '1:1', width: 720, height: 720, desc: 'Fast Square Export (720×720)' },
];

const FPS_OPTIONS = [24, 30, 60];

const QUALITY_PRESETS = [
  { id: 'standard', label: 'Standard (Fast Render)', desc: 'Optimized for fast sharing (CRF 20, 720p/1080p)' },
  { id: 'high', label: 'High Quality (Crisp & Sharp)', desc: 'Standard high-bitrate export, zero blur (CRF 18, sRGB)' },
  { id: 'max', label: 'Master / Lossless PNG Frames', desc: 'Flawless lossless frame capture (CRF 16, PNG)' },
];

export const TopNavigation: React.FC<{ onBackToProjects: () => void }> = ({ onBackToProjects }) => {
  const {
    currentProject,
    timeline,
    historyIndex,
    isLoading,
    activeRenderJob,
    undo,
    redo,
    saveTimeline,
    analyzeVoiceover,
    autoGenerateTimeline,
    startRender,
    loadProject,
    setErrorMessage,
  } = useEditorStore();

  const { jobs: allExportJobs, setDrawerOpen } = useExportStore();
  const activeExportsCount = Object.values(allExportJobs).filter(
    (j) => j.status === 'rendering' || j.status === 'queued' || j.status === 'pending'
  ).length;

  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedRatio, setSelectedRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [selectedResolution, setSelectedResolution] = useState(RESOLUTION_PRESETS[0]);
  const [selectedFps, setSelectedFps] = useState(30);
  const [selectedQuality, setSelectedQuality] = useState('high');
  const [burnCaptions, setBurnCaptions] = useState(true);

  // Synchronize export resolution with project's aspect ratio
  useEffect(() => {
    if (!currentProject) return;
    const projRatio = (currentProject.settings?.aspect_ratio as '16:9' | '9:16' | '1:1') ||
      (currentProject.settings?.width === 1080 && currentProject.settings?.height === 1920 ? '9:16' :
      (currentProject.settings?.width === currentProject.settings?.height ? '1:1' : '16:9'));
    
    setSelectedRatio(projRatio);

    const w = currentProject.settings?.width;
    const h = currentProject.settings?.height;

    let matched = RESOLUTION_PRESETS.find((r) => r.width === w && r.height === h);
    if (!matched && projRatio) {
      matched = RESOLUTION_PRESETS.find((r) => r.ratio === projRatio);
    }
    if (matched) {
      setSelectedResolution(matched);
    }
  }, [currentProject?.id, currentProject?.settings?.aspect_ratio, currentProject?.settings?.width, currentProject?.settings?.height]);

  if (!currentProject) return null;

  const handleSelectRatio = (ratio: '16:9' | '9:16' | '1:1') => {
    setSelectedRatio(ratio);
    // Automatically match first preset for this ratio
    const match = RESOLUTION_PRESETS.find((r) => r.ratio === ratio);
    if (match) {
      setSelectedResolution(match);
    }
  };

  const handlePresetChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPreset = e.target.value;
    try {
      const updatedSettings = {
        ...currentProject.settings,
        preset: newPreset,
      };
      await api.updateProject(currentProject.id, { settings: updatedSettings });
      await loadProject(currentProject.id);
    } catch (err) {
      setErrorMessage('Failed to update preset');
    }
  };

  const handleTransitionStyleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStyle = e.target.value;
    try {
      const updatedSettings = {
        ...currentProject.settings,
        transition_style: newStyle,
      };
      await api.updateProject(currentProject.id, { settings: updatedSettings });
      await loadProject(currentProject.id);
    } catch (err) {
      setErrorMessage('Failed to update transition style');
    }
  };

  const handleEffectStyleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStyle = e.target.value;
    try {
      const updatedSettings = {
        ...currentProject.settings,
        effect_style: newStyle,
      };
      await api.updateProject(currentProject.id, { settings: updatedSettings });
      await loadProject(currentProject.id);
    } catch (err) {
      setErrorMessage('Failed to update animation effect style');
    }
  };

  const handleConfirmExport = async () => {
    setShowExportModal(false);

    // Update project settings to align with the chosen export aspect ratio & resolution
    if (currentProject) {
      const updatedSettings = {
        ...currentProject.settings,
        aspect_ratio: selectedRatio,
        width: selectedResolution.width,
        height: selectedResolution.height,
        fps: selectedFps,
      };
      api.updateProject(currentProject.id, { settings: updatedSettings }).then(() => {
        loadProject(currentProject.id);
      }).catch(() => {});
    }

    await startRender({
      width: selectedResolution.width,
      height: selectedResolution.height,
      fps: selectedFps,
      quality: selectedQuality,
      burn_captions: burnCaptions,
    });
  };

  return (
    <>
      <header className="h-14 bg-[#181B24] border-b border-[#2A2F3A] px-4 flex items-center justify-between select-none z-20 gap-2">
        {/* Left: Logo & Project Name */}
        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={onBackToProjects}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
              <Film size={18} className="text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-white hidden sm:inline">
              AutoVideo Studio
            </span>
          </button>

          <div className="h-4 w-[1px] bg-[#2A2F3A]" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-200">
              {currentProject.name}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950/80 border border-indigo-800 text-indigo-300">
              {currentProject.settings?.aspect_ratio || (currentProject.settings?.width === 1080 && currentProject.settings?.height === 1920 ? '9:16' : (currentProject.settings?.width === currentProject.settings?.height ? '1:1' : '16:9'))}
            </span>
            <span className="text-[10px] font-mono text-gray-500">
              {currentProject.settings?.width || 1920}×{currentProject.settings?.height || 1080}
            </span>
          </div>
        </div>

        {/* Center: Automation Actions */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink overflow-x-auto py-1">
          <button
            onClick={analyzeVoiceover}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#232733] hover:bg-[#2d3242] border border-[#373e50] rounded-md text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors shadow-sm disabled:opacity-50 shrink-0"
          >
            <Sparkles size={14} />
            Analyze Voiceover
          </button>

          <button
            onClick={autoGenerateTimeline}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-md text-xs font-semibold text-white transition-colors shadow-md disabled:opacity-50 shrink-0"
          >
            <Wand2 size={14} />
            Auto Generate Video
          </button>

          {/* Preset Selector */}
          <select
            value={currentProject.settings?.preset || 'documentary'}
            onChange={handlePresetChange}
            className="bg-[#232733] border border-[#373e50] rounded-md px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none shrink-0"
            title="Video Preset"
          >
            <option value="documentary">Preset: Documentary</option>
            <option value="storytelling">Preset: Storytelling</option>
            <option value="dynamic_youtube">Preset: Dynamic YouTube</option>
            <option value="minimal">Preset: Minimal</option>
          </select>

          {/* Transition Style Selector */}
          <select
            value={currentProject.settings?.transition_style || 'crossfade'}
            onChange={handleTransitionStyleChange}
            className="bg-[#232733] border border-[#373e50] rounded-md px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none shrink-0"
            title="Transition Style"
          >
            <option value="crossfade">Transition: Smooth Crossfade (Default)</option>
            <option value="varied">Transition: Varied (Non-Repeating)</option>
            <option value="cinematic">Transition: Cinematic Mix</option>
            <option value="fade">Transition: Fade to Black</option>
            <option value="slide_left">Transition: Slide Left</option>
            <option value="slide_right">Transition: Slide Right</option>
            <option value="zoom">Transition: Zoom Dissolve</option>
            <option value="none">Transition: None (Cut)</option>
          </select>

          {/* Animation Motion Style Selector */}
          <select
            value={currentProject.settings?.effect_style || 'automatic'}
            onChange={handleEffectStyleChange}
            className="bg-[#232733] border border-[#373e50] rounded-md px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none shrink-0"
            title="Motion / Animation Effect Style"
          >
            <option value="automatic">Motion: Varied Ken Burns (Subtle)</option>
            <option value="pan_left">Motion: Pan Left</option>
            <option value="pan_right">Motion: Pan Right</option>
            <option value="zoom_out">Motion: Gentle Zoom Out</option>
            <option value="zoom_in">Motion: Gentle Zoom In</option>
            <option value="zoom_pan">Motion: Zoom & Pan</option>
            <option value="static">Motion: Static (No Zoom)</option>
          </select>
        </div>

        {/* Right: History, Save & Export */}
        <div className="flex items-center gap-2 shrink-0 z-10 ml-auto">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={redo}
            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <RotateCw size={16} />
          </button>

          <div className="h-4 w-[1px] bg-[#2A2F3A] mx-1" />

          <button
            onClick={saveTimeline}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#232733] hover:bg-[#2d3242] border border-[#373e50] rounded-md text-xs font-medium text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <Save size={14} /> Save
          </button>

          {/* Global Exports Activity Button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#202533] hover:bg-[#282f40] border border-[#343d52] rounded-md text-xs font-semibold text-gray-200 transition-colors shadow-sm"
            title="View background exports across all projects"
          >
            <Activity size={14} className={activeExportsCount > 0 ? "animate-pulse text-indigo-400" : "text-gray-400"} />
            <span className="hidden sm:inline">Exports</span>
            {activeExportsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-600 text-white leading-none">
                {activeExportsCount}
              </span>
            )}
          </button>

          {/* Project Export Action */}
          {activeRenderJob && activeRenderJob.status === 'completed' ? (
            <div className="flex items-center gap-2">
              <a
                href={activeRenderJob.download_url || `/api/render-jobs/${activeRenderJob.id}/download`}
                download={`video_${currentProject?.name || 'export'}.mp4`}
                onClick={(e) => {
                  const url = activeRenderJob.download_url || `/api/render-jobs/${activeRenderJob.id}/download`;
                  const filename = `video_${(currentProject?.name || 'export').replace(/[^a-zA-Z0-9_\-]/g, '_')}.mp4`;
                  triggerBrowserDownload(url, filename);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-md text-xs font-semibold text-white transition-colors shadow-md cursor-pointer"
                title="Download video to your PC Downloads folder"
              >
                <Download size={14} /> Download Video
              </a>
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-md text-xs font-semibold text-white transition-all shadow-md cursor-pointer"
                title="Export or re-export video with custom settings"
              >
                <Download size={14} /> Export Video
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowExportModal(true)}
              disabled={isLoading || activeRenderJob?.status === 'rendering' || activeRenderJob?.status === 'queued'}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-md text-xs font-semibold text-white transition-all shadow-md disabled:opacity-50 cursor-pointer"
            >
              {activeRenderJob?.status === 'rendering' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Exporting ({activeRenderJob.progress.toFixed(0)}%)
                </>
              ) : activeRenderJob?.status === 'queued' ? (
                <>
                  <Clock size={14} className="animate-pulse text-amber-300" />
                  Queued (#{activeRenderJob.queue_position || 1})
                </>
              ) : (
                <>
                  <Download size={14} /> Export Video
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* CapCut-Style Export Resolution & Aspect Ratio Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181B24] border border-[#2A2F3A] rounded-2xl w-full max-w-lg max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2F3A] bg-[#141722] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Export Video</h3>
                  <p className="text-[11px] text-gray-400">Select aspect ratio, resolution & quality</p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-[#232733] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* 1. Aspect Ratio Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 flex items-center justify-between">
                  <span>Aspect Ratio</span>
                  <span className="text-[11px] font-normal text-indigo-400 font-mono">
                    Target: {selectedRatio}
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: '16:9' as const, label: '16:9', title: 'YouTube', icon: 'w-7 h-4' },
                    { id: '9:16' as const, label: '9:16', title: 'Shorts / Reels', icon: 'w-4 h-7' },
                    { id: '1:1' as const, label: '1:1', title: 'Square', icon: 'w-5 h-5' },
                  ].map((ratioOpt) => {
                    const isRatioActive = selectedRatio === ratioOpt.id;
                    return (
                      <button
                        key={ratioOpt.id}
                        type="button"
                        onClick={() => handleSelectRatio(ratioOpt.id)}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                          isRatioActive
                            ? 'border-indigo-500 bg-indigo-950/50 text-white shadow-md shadow-indigo-950/40 ring-1 ring-indigo-500/50'
                            : 'border-[#2A2F3A] bg-[#11131a] hover:border-gray-600 text-gray-300 hover:bg-[#151824]'
                        }`}
                      >
                        <div className="h-9 w-9 rounded-md bg-[#1e2230] flex items-center justify-center">
                          <div
                            className={`border-2 ${
                              isRatioActive ? 'border-indigo-400 bg-indigo-500/25' : 'border-gray-500 bg-gray-700/20'
                            } rounded-xs ${ratioOpt.icon}`}
                          />
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-bold leading-none">{ratioOpt.label}</div>
                          <div className="text-[10px] text-gray-400 mt-1">{ratioOpt.title}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Resolution Presets */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300">Resolution</label>
                <div className="space-y-2">
                  {RESOLUTION_PRESETS.filter((r) => r.ratio === selectedRatio).map((res) => {
                    const isSelected = selectedResolution.id === res.id;
                    return (
                      <div
                        key={res.id}
                        onClick={() => setSelectedResolution(res)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-950/40 text-white ring-1 ring-indigo-500/40 shadow-sm'
                            : 'border-[#2A2F3A] bg-[#11131a] hover:border-gray-600 text-gray-300 hover:bg-[#141723]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isSelected ? 'border-indigo-500 bg-indigo-600' : 'border-gray-600'
                            }`}
                          >
                            {isSelected && <Check size={10} className="text-white" />}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-white">{res.label}</div>
                            <div className="text-[11px] text-gray-400">{res.desc}</div>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-medium text-indigo-300 bg-indigo-950/70 border border-indigo-800/60 px-2.5 py-1 rounded-md">
                          {res.width} × {res.height}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Frame Rate (FPS) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300">Frame Rate</label>
                <div className="grid grid-cols-3 gap-2">
                  {FPS_OPTIONS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSelectedFps(f)}
                      className={`py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                        selectedFps === f
                          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                          : 'border-[#2A2F3A] bg-[#11131a] hover:border-gray-600 text-gray-300'
                      }`}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Export Quality & Color Fidelity */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300">Export Quality</label>
                <div className="space-y-2">
                  {QUALITY_PRESETS.map((q) => {
                    const isQSelected = selectedQuality === q.id;
                    return (
                      <div
                        key={q.id}
                        onClick={() => setSelectedQuality(q.id)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isQSelected
                            ? 'border-indigo-500 bg-indigo-950/40 text-white ring-1 ring-indigo-500/40'
                            : 'border-[#2A2F3A] bg-[#11131a] hover:border-gray-600 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                              isQSelected ? 'border-indigo-500 bg-indigo-600' : 'border-gray-600'
                            }`}
                          >
                            {isQSelected && <Check size={8} className="text-white" />}
                          </div>
                          <div>
                            <div className="text-xs font-semibold">{q.label}</div>
                            <div className="text-[10px] text-gray-400">{q.desc}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 5. Subtitles / Captions Burn-In Option */}
              <div className="p-3 bg-[#11131a] border border-[#2A2F3A] rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-purple-950/60 border border-purple-800 text-purple-400">
                    <Type size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Burn Captions into Video</div>
                    <div className="text-[11px] text-gray-400">
                      {timeline?.captions?.settings?.enabled
                        ? `Include synchronized captions (${timeline.captions.settings.mode})`
                        : 'Captions disabled in timeline'}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={burnCaptions}
                  onChange={(e) => setBurnCaptions(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Sticky Fixed Bottom Footer - Export Button is GUARANTEED to be visible */}
            <div className="border-t border-[#2A2F3A] bg-[#141722] px-6 py-4 flex items-center justify-between shrink-0">
              <div className="text-left">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{selectedResolution.width} × {selectedResolution.height}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/60 border border-indigo-700/60 text-indigo-300">
                    {selectedRatio}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {selectedFps} FPS · {QUALITY_PRESETS.find((q) => q.id === selectedQuality)?.label.split(' ')[0]}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExport}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  <Download size={15} /> Export Video
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Background Export Drawer */}
      <ExportManagerDrawer />
    </>
  );
};
