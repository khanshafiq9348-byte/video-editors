import { create } from 'zustand';
import { ProjectDetail, TimelineData, SceneItem, Asset, SentenceItem, RenderJob } from '../types/timeline';
import { BUILTIN_CAPTION_PRESETS, CaptionPreset, CaptionStyle, CaptionSegment, CaptionMode, TimelineCaptions } from '../types/captions';
import { api } from '../services/api';
import { triggerBrowserDownload } from '../utils/downloadHelper';
import { useExportStore } from './exportStore';

let autoSaveTimer: any = null;

interface EditorState {
  currentProject: ProjectDetail | null;
  timeline: TimelineData | null;
  waveform: number[];
  selectedSceneId: string | null;
  activeRenderJob: RenderJob | null;
  isPlaying: boolean;
  currentFrame: number;
  zoomLevel: number; // pixels per second
  isLoading: boolean;
  statusMessage: string;
  errorMessage: string | null;

  // History for undo/redo
  history: TimelineData[];
  historyIndex: number;

  // Actions
  loadProject: (id: string) => Promise<void>;
  setCurrentProject: (proj: ProjectDetail) => void;
  setTimeline: (timeline: TimelineData, addToHistory?: boolean, autoSave?: boolean) => void;
  setSelectedSceneId: (id: string | null) => void;
  setCurrentFrame: (frame: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoomLevel: (zoom: number) => void;
  setStatusMessage: (msg: string) => void;
  setErrorMessage: (msg: string | null) => void;
  
  // Undo / Redo
  undo: () => void;
  redo: () => void;

  // Scene Operations
  updateScene: (sceneId: string, partial: Partial<SceneItem>) => void;
  reorderScenes: (startIndex: number, endIndex: number) => void;
  splitScene: (sceneId: string, splitFrame: number) => void;
  deleteScene: (sceneId: string) => void;

  // Captions State & Operations
  selectedCaptionId: string | null;
  setSelectedCaptionId: (id: string | null) => void;
  generateCaptions: (options?: { presetId?: string; mode?: string; wordsPerSegment?: number }) => Promise<void>;
  toggleCaptionsEnabled: () => void;
  setCaptionMode: (mode: any) => void;
  applyCaptionPreset: (presetId: string) => void;
  updateGlobalCaptionStyle: (partial: any) => void;
  updateCaptionSegment: (segmentId: string, partial: any) => void;
  updateSegmentStyleOverride: (segmentId: string, override: any | null) => void;
  splitCaptionSegment: (segmentId: string, splitFrame: number) => void;
  deleteCaptionSegment: (segmentId: string) => void;
  mergeCaptionSegments: (firstSegmentId: string, secondSegmentId: string) => void;
  addCustomPreset: (preset: any) => void;
  deleteCustomPreset: (presetId: string) => void;
  exportSrt: () => void;
  exportVtt: () => void;

  // Remote Sync Actions
  saveTimeline: () => Promise<void>;
  analyzeVoiceover: () => Promise<void>;
  autoGenerateTimeline: () => Promise<void>;
  startRender: (options?: { width?: number; height?: number; fps?: number; quality?: string; aspect_ratio?: string; burn_captions?: boolean }) => Promise<void>;
  pollRenderStatus: (jobId?: string) => Promise<void>;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentProject: null,
  timeline: null,
  waveform: [],
  selectedSceneId: null,
  selectedCaptionId: null,
  activeRenderJob: null,
  isPlaying: false,
  currentFrame: 0,
  zoomLevel: 50, // 50px per second default
  isLoading: false,
  statusMessage: '',
  errorMessage: null,

  history: [],
  historyIndex: -1,

  loadProject: async (id: string) => {
    set({ isLoading: true, errorMessage: null, statusMessage: 'Loading project...' });
    try {
      const proj = await api.getProject(id);
      let wf: number[] = [];
      const hasAudio = proj.assets.some((a) => a.type === 'audio');
      if (hasAudio) {
        try {
          const wfRes = await api.getWaveform(id);
          wf = wfRes.points;
        } catch (e) {
          console.warn('Waveform fetch failed', e);
        }
      }

      let latestJob: RenderJob | null = null;
      try {
        latestJob = await api.getLatestRenderJob(id);
      } catch (e) {
        // No previous job
      }

      let loadedTimeline = proj.timeline || null;
      if (!loadedTimeline) {
        try {
          const tl = await api.getTimeline(id);
          if (tl && tl.scenes && tl.scenes.length > 0) {
            loadedTimeline = tl;
          }
        } catch (e) {
          // No timeline
        }
      }

      const currentTl = get().timeline;
      if ((!loadedTimeline || !loadedTimeline.scenes || loadedTimeline.scenes.length === 0) && currentTl && currentTl.scenes && currentTl.scenes.length > 0) {
        loadedTimeline = currentTl;
      }

      if (loadedTimeline && (!loadedTimeline.captions || !loadedTimeline.captions.segments || loadedTimeline.captions.segments.length === 0)) {
        try {
          const caps = await api.getCaptions(id);
          if (caps && caps.segments && caps.segments.length > 0) {
            loadedTimeline = { ...loadedTimeline, captions: caps };
          } else if (currentTl?.captions?.segments && currentTl.captions.segments.length > 0) {
            loadedTimeline = { ...loadedTimeline, captions: currentTl.captions };
          }
        } catch (e) {
          if (currentTl?.captions?.segments && currentTl.captions.segments.length > 0) {
            loadedTimeline = { ...loadedTimeline, captions: currentTl.captions };
          }
        }
      }

      // Normalize any snake_case caption fields from legacy DB records
      if (loadedTimeline && loadedTimeline.captions) {
        const caps = loadedTimeline.captions as any;
        if (caps.settings) {
          if (!caps.settings.selectedPresetId && caps.settings.selected_preset_id) {
            caps.settings.selectedPresetId = caps.settings.selected_preset_id;
          }
          if (!caps.settings.globalStyle && caps.settings.global_style) {
            caps.settings.globalStyle = caps.settings.global_style;
          }
          if (!caps.settings.customPresets && caps.settings.custom_presets) {
            caps.settings.customPresets = caps.settings.custom_presets;
          }
        }
        if (Array.isArray(caps.segments)) {
          caps.segments = caps.segments.map((seg: any) => ({
            ...seg,
            startFrame: seg.startFrame ?? seg.start_frame ?? 0,
            endFrame: seg.endFrame ?? seg.end_frame ?? 30,
            words: Array.isArray(seg.words) ? seg.words.map((w: any) => ({
              ...w,
              startFrame: w.startFrame ?? w.start_frame ?? 0,
              endFrame: w.endFrame ?? w.end_frame ?? 30,
            })) : [],
          }));
        }
      }

      set({
        currentProject: proj,
        timeline: loadedTimeline,
        waveform: wf,
        activeRenderJob: latestJob,
        isLoading: false,
        statusMessage: 'Project loaded',
        history: loadedTimeline ? [loadedTimeline] : [],
        historyIndex: loadedTimeline ? 0 : -1,
      });

      if (latestJob && (latestJob.status === 'rendering' || latestJob.status === 'queued' || latestJob.status === 'pending')) {
        get().pollRenderStatus(latestJob.id);
      }
    } catch (err: any) {
      set({
        isLoading: false,
        errorMessage: err.response?.data?.detail || err.message || 'Failed to load project',
      });
    }
  },

  setCurrentProject: (proj) => set({ currentProject: proj }),

  setTimeline: (newTimeline, addToHistory = true, autoSave = true) => {
    const { history, historyIndex, currentProject } = get();
    if (addToHistory) {
      const updatedHistory = history.slice(0, historyIndex + 1);
      updatedHistory.push(JSON.parse(JSON.stringify(newTimeline)));
      set({
        timeline: newTimeline,
        history: updatedHistory,
        historyIndex: updatedHistory.length - 1,
      });
    } else {
      set({ timeline: newTimeline });
    }

    if (autoSave && currentProject) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(async () => {
        try {
          await api.updateTimeline(currentProject.id, newTimeline);
        } catch (e) {
          console.warn('[AutoSave] Background timeline update failed', e);
        }
      }, 500);
    }
  },

  setSelectedSceneId: (id) => set({ selectedSceneId: id }),
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setZoomLevel: (zoom) => set({ zoomLevel: Math.max(10, Math.min(200, zoom)) }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
  setErrorMessage: (msg) => set({ errorMessage: msg }),

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const nextIndex = historyIndex - 1;
      const prevTimeline = JSON.parse(JSON.stringify(history[nextIndex]));
      set({
        timeline: prevTimeline,
        historyIndex: nextIndex,
      });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextTimeline = JSON.parse(JSON.stringify(history[nextIndex]));
      set({
        timeline: nextTimeline,
        historyIndex: nextIndex,
      });
    }
  },

  updateScene: (sceneId, partial) => {
    const { timeline, setTimeline } = get();
    if (!timeline) return;

    const newScenes = timeline.scenes.map((s) => {
      if (s.id === sceneId) {
        return {
          ...s,
          ...partial,
          effect: partial.effect ? { ...s.effect, ...partial.effect } : s.effect,
          transitionOut: partial.transitionOut !== undefined ? partial.transitionOut : s.transitionOut,
        };
      }
      return s;
    });

    const updatedTimeline = { ...timeline, scenes: newScenes };
    setTimeline(updatedTimeline, true);
  },

  reorderScenes: (startIndex, endIndex) => {
    const { timeline, setTimeline } = get();
    if (!timeline) return;

    const scenes = [...timeline.scenes];
    const [moved] = scenes.splice(startIndex, 1);
    scenes.splice(endIndex, 0, moved);

    // Recalculate start frames sequentially
    let currFrame = 0;
    const reindexedScenes = scenes.map((s) => {
      const updated = { ...s, startFrame: currFrame };
      currFrame += s.durationFrames;
      return updated;
    });

    setTimeline({ ...timeline, scenes: reindexedScenes, totalDurationFrames: Math.max(timeline.totalDurationFrames, currFrame) }, true);
  },

  splitScene: (sceneId, splitFrame) => {
    const { timeline, setTimeline } = get();
    if (!timeline) return;

    const sceneIdx = timeline.scenes.findIndex((s) => s.id === sceneId);
    if (sceneIdx === -1) return;

    const scene = timeline.scenes[sceneIdx];
    const relativeSplit = splitFrame - scene.startFrame;
    if (relativeSplit < 15 || relativeSplit > scene.durationFrames - 15) {
      return; // Scene too short to split
    }

    const firstHalf: SceneItem = {
      ...scene,
      durationFrames: relativeSplit,
    };

    const secondHalf: SceneItem = {
      ...scene,
      id: `${scene.id}_split_${Date.now()}`,
      startFrame: splitFrame,
      durationFrames: scene.durationFrames - relativeSplit,
    };

    const newScenes = [...timeline.scenes];
    newScenes.splice(sceneIdx, 1, firstHalf, secondHalf);
    setTimeline({ ...timeline, scenes: newScenes }, true);
  },

  deleteScene: (sceneId) => {
    const { timeline, setTimeline } = get();
    if (!timeline) return;

    const remaining = timeline.scenes.filter((s) => s.id !== sceneId);
    let currFrame = 0;
    const recalculated = remaining.map((s) => {
      const updated = { ...s, startFrame: currFrame };
      currFrame += s.durationFrames;
      return updated;
    });

    setTimeline({ ...timeline, scenes: recalculated, totalDurationFrames: currFrame }, true);
    set({ selectedSceneId: null });
  },

  saveTimeline: async () => {
    const { currentProject, timeline } = get();
    if (!currentProject || !timeline) return;
    try {
      set({ statusMessage: 'Saving timeline...' });
      const updated = await api.updateTimeline(currentProject.id, timeline);
      set({ timeline: updated, statusMessage: 'Timeline saved' });
    } catch (err: any) {
      set({ errorMessage: 'Failed to save timeline' });
    }
  },

  // Captions Operations
  setSelectedCaptionId: (id: string | null) => {
    set({ selectedCaptionId: id });
  },

  generateCaptions: async (options?: { presetId?: string; mode?: string; wordsPerSegment?: number }) => {
    const { currentProject, timeline, setTimeline } = get();
    if (!currentProject) return;
    try {
      set({ isLoading: true, statusMessage: 'Analyzing voiceover & generating captions...' });
      const caps = await api.generateCaptions(currentProject.id, options);
      if (timeline) {
        const updatedTl = { ...timeline, captions: caps };
        setTimeline(updatedTl, true);
      } else {
        const audioAsset = currentProject.assets.find((a) => a.type === 'audio');
        const fps = currentProject.settings?.fps || 30;
        const totalDurationSec = audioAsset?.duration || 10;
        const initTl: TimelineData = {
          projectId: currentProject.id,
          settings: currentProject.settings,
          audio: audioAsset ? { assetId: audioAsset.id, startFrame: 0, durationFrames: Math.round(totalDurationSec * fps) } : null,
          scenes: [],
          totalDurationFrames: Math.round(totalDurationSec * fps),
          captions: caps,
        };
        setTimeline(initTl, true);
      }
      try {
        const sents = await api.getSentences(currentProject.id);
        if (sents && sents.length > 0) {
          set({ currentProject: { ...get().currentProject!, sentences: sents } });
        }
      } catch (e) {
        // Safe to ignore
      }
      set({ isLoading: false, statusMessage: 'Captions generated successfully!' });
    } catch (err: any) {
      set({
        isLoading: false,
        errorMessage: err.response?.data?.detail || err.message || 'Failed to generate captions. Please ensure voiceover is uploaded.',
      });
    }
  },

  toggleCaptionsEnabled: () => {
    const { timeline, setTimeline } = get();
    if (!timeline || !timeline.captions) return;
    const currentEnabled = timeline.captions.settings?.enabled ?? true;
    const updatedCaptions = {
      ...timeline.captions,
      settings: {
        ...timeline.captions.settings,
        enabled: !currentEnabled,
      },
    };
    setTimeline({ ...timeline, captions: updatedCaptions });
  },

  setCaptionMode: (mode: CaptionMode) => {
    const { timeline, setTimeline } = get();
    if (!timeline || !timeline.captions) return;
    const updatedCaptions = {
      ...timeline.captions,
      settings: {
        ...timeline.captions.settings,
        mode,
      },
    };
    setTimeline({ ...timeline, captions: updatedCaptions });
  },

  applyCaptionPreset: (presetId: string) => {
    const { timeline, setTimeline } = get();
    if (!timeline || !timeline.captions) return;
    const allPresets = [
      ...BUILTIN_CAPTION_PRESETS,
      ...(timeline.captions.settings.customPresets || []),
    ];
    const found = allPresets.find((p) => p.id === presetId);
    if (!found) return;

    const updatedCaptions = {
      ...timeline.captions,
      settings: {
        ...timeline.captions.settings,
        selectedPresetId: found.id,
        mode: found.mode,
        globalStyle: { ...found.style },
      },
    };
    setTimeline({ ...timeline, captions: updatedCaptions }, true);
  },

  updateGlobalCaptionStyle: (partial: Partial<CaptionStyle>) => {
    const { timeline, setTimeline } = get();
    if (!timeline || !timeline.captions) return;
    const updatedCaptions = {
      ...timeline.captions,
      settings: {
        ...timeline.captions.settings,
        globalStyle: {
          ...timeline.captions.settings.globalStyle,
          ...partial,
        },
      },
    };
    setTimeline({ ...timeline, captions: updatedCaptions });
  },

  updateCaptionSegment: (segmentId: string, partial: Partial<CaptionSegment>) => {
    const { timeline, setTimeline } = get();
    if (!timeline || !timeline.captions) return;
    const fps = timeline.settings.fps || 30;
    const updatedSegments = timeline.captions.segments.map((seg) => {
      if (seg.id !== segmentId) return seg;
      const updated = { ...seg, ...partial };
      if (partial.startFrame !== undefined) {
        updated.startTime = Number((partial.startFrame / fps).toFixed(3));
      }
      if (partial.endFrame !== undefined) {
        updated.endTime = Number((partial.endFrame / fps).toFixed(3));
      }

      // If text changed, keep words array in sync with the new text
      if (partial.text !== undefined && partial.text !== seg.text) {
        const cleanText = partial.text.trim();
        const newWordTexts = cleanText ? cleanText.split(/\s+/).filter(Boolean) : [];
        const startF = updated.startFrame;
        const endF = updated.endFrame;
        const durF = Math.max(1, endF - startF);

        if (seg.words && seg.words.length === newWordTexts.length) {
          // Same word count: maintain word timing, update text & punctuation
          updated.words = seg.words.map((w, wIdx) => ({
            ...w,
            text: newWordTexts[wIdx],
          }));
        } else {
          // Word count changed: evenly distribute timing across new words
          const wDur = durF / Math.max(1, newWordTexts.length);
          updated.words = newWordTexts.map((txt, wIdx) => ({
            id: `word_${Date.now()}_${wIdx}`,
            text: txt,
            startFrame: Math.round(startF + wIdx * wDur),
            endFrame: Math.round(startF + (wIdx + 1) * wDur),
            startTime: Number(((startF + wIdx * wDur) / fps).toFixed(3)),
            endTime: Number(((startF + (wIdx + 1) * wDur) / fps).toFixed(3)),
            confidence: 1.0,
          }));
        }
      }

      return updated;
    });
    setTimeline({
      ...timeline,
      captions: {
        ...timeline.captions,
        segments: updatedSegments,
      },
    }, true, true);
  },

  updateSegmentStyleOverride: (segmentId: string, override: Partial<CaptionStyle> | null) => {
    const { timeline, setTimeline } = get();
    if (!timeline || !timeline.captions) return;
    const updatedSegments = timeline.captions.segments.map((seg) => {
      if (seg.id !== segmentId) return seg;
      return {
        ...seg,
        styleOverride: override ? { ...(seg.styleOverride || {}), ...override } : undefined,
      };
    });
    setTimeline({
      ...timeline,
      captions: {
        ...timeline.captions,
        segments: updatedSegments,
      },
    });
  },

  splitCaptionSegment: (segmentId: string, splitFrame: number) => {
    const { timeline, setTimeline } = get();
    if (!timeline || !timeline.captions) return;
    const fps = timeline.settings.fps || 30;
    const targetIdx = timeline.captions.segments.findIndex((s) => s.id === segmentId);
    if (targetIdx === -1) return;

    const seg = timeline.captions.segments[targetIdx];
    if (splitFrame <= seg.startFrame + 5 || splitFrame >= seg.endFrame - 5) return;

    const words = seg.words || [];
    const firstWords = words.filter((w) => w.endFrame <= splitFrame || w.startFrame < splitFrame);
    const secondWords = words.filter((w) => !firstWords.includes(w));

    const seg1: CaptionSegment = {
      ...seg,
      id: `${seg.id}_a`,
      endFrame: splitFrame,
      endTime: Number((splitFrame / fps).toFixed(3)),
      text: firstWords.map((w) => w.text).join(' ') || seg.text.slice(0, Math.floor(seg.text.length / 2)).trim(),
      words: firstWords,
    };

    const seg2: CaptionSegment = {
      ...seg,
      id: `${seg.id}_b`,
      startFrame: splitFrame,
      startTime: Number((splitFrame / fps).toFixed(3)),
      text: secondWords.map((w) => w.text).join(' ') || seg.text.slice(Math.floor(seg.text.length / 2)).trim(),
      words: secondWords,
    };

    const newSegments = [...timeline.captions.segments];
    newSegments.splice(targetIdx, 1, seg1, seg2);

    setTimeline({
      ...timeline,
      captions: {
        ...timeline.captions,
        segments: newSegments,
      },
    }, true);
  },

  deleteCaptionSegment: (segmentId: string) => {
    const { timeline, setTimeline, selectedCaptionId } = get();
    if (!timeline || !timeline.captions) return;
    const newSegments = timeline.captions.segments.filter((s) => s.id !== segmentId);
    setTimeline({
      ...timeline,
      captions: {
        ...timeline.captions,
        segments: newSegments,
      },
    }, true);
    if (selectedCaptionId === segmentId) {
      set({ selectedCaptionId: null });
    }
  },

  mergeCaptionSegments: (firstSegmentId: string, secondSegmentId: string) => {
    const { timeline, setTimeline } = get();
    if (!timeline || !timeline.captions) return;
    const segments = [...timeline.captions.segments];
    const idx1 = segments.findIndex((s) => s.id === firstSegmentId);
    const idx2 = segments.findIndex((s) => s.id === secondSegmentId);
    if (idx1 === -1 || idx2 === -1) return;

    const seg1 = segments[idx1];
    const seg2 = segments[idx2];
    const mergedSeg: CaptionSegment = {
      ...seg1,
      endFrame: Math.max(seg1.endFrame, seg2.endFrame),
      endTime: Math.max(seg1.endTime || 0, seg2.endTime || 0),
      text: `${seg1.text} ${seg2.text}`.trim(),
      words: [...(seg1.words || []), ...(seg2.words || [])].sort((a, b) => a.startFrame - b.startFrame),
    };

    const filtered = segments.filter((s) => s.id !== firstSegmentId && s.id !== secondSegmentId);
    filtered.splice(Math.min(idx1, idx2), 0, mergedSeg);

    setTimeline({
      ...timeline,
      captions: {
        ...timeline.captions,
        segments: filtered,
      },
    }, true);
  },

  addCustomPreset: (preset: CaptionPreset) => {
    const { timeline, setTimeline } = get();
    if (!timeline || !timeline.captions) return;
    const existing = timeline.captions.settings.customPresets || [];
    const updatedCustoms = [...existing.filter((p) => p.id !== preset.id), preset];
    const updatedCaptions = {
      ...timeline.captions,
      settings: {
        ...timeline.captions.settings,
        customPresets: updatedCustoms,
      },
    };
    setTimeline({ ...timeline, captions: updatedCaptions });
  },

  deleteCustomPreset: (presetId: string) => {
    const { timeline, setTimeline } = get();
    if (!timeline || !timeline.captions) return;
    const existing = timeline.captions.settings.customPresets || [];
    const updatedCustoms = existing.filter((p) => p.id !== presetId);
    const updatedCaptions = {
      ...timeline.captions,
      settings: {
        ...timeline.captions.settings,
        customPresets: updatedCustoms,
      },
    };
    setTimeline({ ...timeline, captions: updatedCaptions });
  },

  exportSrt: () => {
    const { currentProject } = get();
    if (!currentProject) return;
    const url = api.getSrtExportUrl(currentProject.id);
    const filename = `${(currentProject.name || 'captions').replace(/[^a-zA-Z0-9_\-]/g, '_')}.srt`;
    triggerBrowserDownload(url, filename);
  },

  exportVtt: () => {
    const { currentProject } = get();
    if (!currentProject) return;
    const url = api.getVttExportUrl(currentProject.id);
    const filename = `${(currentProject.name || 'captions').replace(/[^a-zA-Z0-9_\-]/g, '_')}.vtt`;
    triggerBrowserDownload(url, filename);
  },

  analyzeVoiceover: async () => {
    const { currentProject, loadProject } = get();
    if (!currentProject) return;
    try {
      set({ isLoading: true, statusMessage: 'Analyzing voiceover sentences...' });
      await api.analyzeAudio(currentProject.id);
      await loadProject(currentProject.id);
      set({ isLoading: false, statusMessage: 'Voiceover analysis complete!' });
    } catch (err: any) {
      set({
        isLoading: false,
        errorMessage: err.response?.data?.detail || 'Voiceover analysis failed',
      });
    }
  },

  autoGenerateTimeline: async () => {
    const { currentProject, setTimeline } = get();
    if (!currentProject) return;
    try {
      set({ isLoading: true, statusMessage: 'Analyzing voiceover & aligning timeline...' });
      const hasAudio = currentProject.assets.some((a) => a.type === 'audio');
      if (hasAudio) {
        try {
          const sentences = await api.analyzeAudio(currentProject.id);
          if (sentences && sentences.length > 0) {
            set({ currentProject: { ...get().currentProject!, sentences } });
          }
        } catch (e) {
          console.warn('Audio analysis note:', e);
        }
      }
      const tl = await api.generateTimeline(currentProject.id);
      setTimeline(tl, true);
      set({ isLoading: false, statusMessage: 'Timeline synchronized to voiceover!' });
    } catch (err: any) {
      set({
        isLoading: false,
        errorMessage: err.response?.data?.detail || err.message || 'Timeline generation failed',
      });
    }
  },

  startRender: async (options?: { width?: number; height?: number; fps?: number; quality?: string; aspect_ratio?: string }) => {
    const { currentProject, pollRenderStatus } = get();
    if (!currentProject) return;
    try {
      set({ isLoading: true, statusMessage: 'Submitting render job...' });
      const job = await api.renderVideo(currentProject.id, options);
      const msg = job.status === 'queued'
        ? `Export queued (Position #${job.queue_position || 1}). Processing in background...`
        : 'Video exporting in background...';
      set({ activeRenderJob: job, isLoading: false, statusMessage: msg });
      pollRenderStatus(job.id);
      useExportStore.getState().refreshAllJobs();
    } catch (err: any) {
      set({
        isLoading: false,
        errorMessage: err.response?.data?.detail || 'Failed to start video rendering',
      });
    }
  },

  pollRenderStatus: async (jobIdParam?: string) => {
    const { activeRenderJob } = get();
    const jobId = jobIdParam || activeRenderJob?.id;
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const job = await api.getRenderJob(jobId);
        // Only update activeRenderJob if this job belongs to the currently viewed project
        if (get().currentProject?.id === job.project_id) {
          set({ activeRenderJob: job });
        }
        useExportStore.getState().refreshAllJobs();

        if (job.status === 'completed') {
          clearInterval(interval);
          if (get().currentProject?.id === job.project_id) {
            set({
              statusMessage: 'Video export completed! Click "Download Video" to save it.',
            });
          }
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          clearInterval(interval);
          if (get().currentProject?.id === job.project_id) {
            set({ errorMessage: job.error_message || 'Video export failed' });
          }
        }
      } catch (e) {
        clearInterval(interval);
      }
    }, 1500);
  },
}));
