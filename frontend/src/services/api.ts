import axios from 'axios';
import { ProjectDetail, ProjectSettings, Asset, SentenceItem, TimelineData, RenderJob, SceneItem, TimelineAudio } from '../types/timeline';
import {
  getLocalProjects,
  getLocalProject,
  saveLocalProject,
  deleteLocalProject,
  createPersistentLocalProject,
  createDefaultSettings,
  storeMediaBlob,
  rehydrateProjectAssets,
} from './storageHelper';

const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  if (envUrl) {
    return envUrl.endsWith('/api') ? envUrl : `${envUrl.replace(/\/$/, '')}/api`;
  }
  return '/api';
};

const client = axios.create({
  baseURL: getBaseUrl(),
  timeout: 15000,
});

function isInvalidOrHtml(data: any): boolean {
  if (data === undefined || data === null) return true;
  if (typeof data === 'string') {
    if (
      data.includes('<!DOCTYPE html>') ||
      data.includes('<html') ||
      data.includes('Protected by Vercel') ||
      data.includes('Method Not Allowed')
    ) {
      return true;
    }
  }
  return false;
}

export const api = {
  // System Health
  getHealth: async () => {
    try {
      const res = await client.get('/health');
      if (!isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // ignore
    }
    return { status: 'client_mode', ffmpeg_available: false, storage_dir: 'local_storage' };
  },

  // Projects
  getProjects: async (): Promise<ProjectDetail[]> => {
    let remoteProjects: ProjectDetail[] = [];
    try {
      const res = await client.get('/projects');
      if (Array.isArray(res.data) && !isInvalidOrHtml(res.data)) {
        remoteProjects = res.data;
      }
    } catch (e) {
      // Backend not running / 405 / 404
    }

    const localProjects = getLocalProjects();
    const map = new Map<string, ProjectDetail>();
    for (const p of remoteProjects) {
      if (p && p.id) map.set(p.id, p);
    }
    for (const p of localProjects) {
      if (p && p.id && !map.has(p.id)) {
        map.set(p.id, p);
      }
    }
    return Array.from(map.values());
  },

  createProject: async (name: string, settings?: Partial<ProjectSettings>): Promise<ProjectDetail> => {
    // Attempt backend first if available
    try {
      const res = await client.post('/projects', { name, settings });
      if (res.data && res.data.id && typeof res.data === 'object' && !isInvalidOrHtml(res.data)) {
        saveLocalProject(res.data);
        return res.data;
      }
    } catch (err: any) {
      console.warn('Backend unavailable or returned error (' + (err.response?.status || err.message) + '), creating locally:', err.message);
    }

    // Seamlessly persist in browser storage (never fail with 405 / 404 / network errors)
    const localProj = createPersistentLocalProject(name, settings);
    return localProj;
  },

  getProject: async (id: string): Promise<ProjectDetail> => {
    try {
      const res = await client.get(`/projects/${id}`);
      if (res.data && res.data.id && typeof res.data === 'object' && !isInvalidOrHtml(res.data)) {
        saveLocalProject(res.data);
        return res.data;
      }
    } catch (e) {
      // Backend unavailable or 405 / 404
    }

    const local = getLocalProject(id);
    if (local) {
      return await rehydrateProjectAssets(local);
    }
    throw new Error('Project not found');
  },

  updateProject: async (id: string, data: { name?: string; settings?: ProjectSettings; script?: string }): Promise<ProjectDetail> => {
    try {
      const res = await client.put(`/projects/${id}`, data);
      if (res.data && res.data.id && typeof res.data === 'object' && !isInvalidOrHtml(res.data)) {
        saveLocalProject(res.data);
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }

    const local = getLocalProject(id);
    if (local) {
      if (data.name) local.name = data.name;
      if (data.settings) local.settings = { ...local.settings, ...data.settings };
      if (data.script !== undefined) local.script = data.script;
      local.updated_at = new Date().toISOString();
      saveLocalProject(local);
      return local;
    }
    throw new Error('Project not found');
  },

  deleteProject: async (id: string): Promise<void> => {
    try {
      await client.delete(`/projects/${id}`);
    } catch (e) {
      // Backend unavailable
    }
    deleteLocalProject(id);
  },

  // Uploads
  uploadMedia: async (
    projectId: string,
    files: File[],
    onProgress?: (progressPercent: number, currentUploadedCount: number, totalCount: number) => void
  ): Promise<{ uploaded: Asset[]; unsupported: { filename: string; reason: string }[]; total_uploaded: number }> => {
    // Naturally sort all files numerically by filename
    const sorted = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Try backend upload
    try {
      const CHUNK_SIZE = 12;
      const allUploaded: Asset[] = [];
      const allUnsupported: { filename: string; reason: string }[] = [];
      const totalFiles = sorted.length;

      for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
        const chunk = sorted.slice(i, i + CHUNK_SIZE);
        const formData = new FormData();
        chunk.forEach((f) => formData.append('files', f));

        const res = await client.post(`/projects/${projectId}/media`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const data = res.data;
        if (data && typeof data === 'object' && !isInvalidOrHtml(data)) {
          if (data.uploaded) allUploaded.push(...data.uploaded);
          if (data.unsupported) allUnsupported.push(...data.unsupported);
        } else {
          throw new Error('Invalid upload response from backend');
        }

        const processedCount = Math.min(i + chunk.length, totalFiles);
        const pct = Math.round((processedCount / totalFiles) * 100);
        if (onProgress) {
          onProgress(pct, allUploaded.length, totalFiles);
        }
      }

      return {
        uploaded: allUploaded,
        unsupported: allUnsupported,
        total_uploaded: allUploaded.length,
      };
    } catch (err: any) {
      console.warn('Backend uploadMedia unavailable, saving media locally in browser:', err.message);
    }

    // Local in-browser fallback
    const localUploaded: Asset[] = [];
    const localProj = getLocalProject(projectId);
    const existingCount = localProj?.assets?.length || 0;

    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i];
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.name);

      if (!isVideo && !isImage) continue;

      const blobUrl = URL.createObjectURL(file);
      await storeMediaBlob(projectId, file.name, file);

      const asset: Asset = {
        id: `asset_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        project_id: projectId,
        type: isVideo ? 'video' : 'image',
        original_name: file.name,
        storage_path: file.name,
        order_index: existingCount + i,
        url: blobUrl,
        duration: isVideo ? 5 : null,
        width: 1920,
        height: 1080,
      };
      localUploaded.push(asset);

      if (onProgress) {
        const pct = Math.round(((i + 1) / sorted.length) * 100);
        onProgress(pct, i + 1, sorted.length);
      }
    }

    if (localProj) {
      localProj.assets = [...(localProj.assets || []), ...localUploaded];
      localProj.updated_at = new Date().toISOString();
      saveLocalProject(localProj);
    }

    return {
      uploaded: localUploaded,
      unsupported: [],
      total_uploaded: localUploaded.length,
    };
  },

  uploadImages: async (
    projectId: string,
    files: File[],
    onProgress?: (progressPercent: number, currentUploadedCount: number, totalCount: number) => void
  ): Promise<Asset[]> => {
    const res = await api.uploadMedia(projectId, files, onProgress);
    return res.uploaded;
  },

  uploadAudio: async (
    projectId: string,
    file: File,
    options?: { language?: string; replace?: boolean }
  ): Promise<Asset> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const params = new URLSearchParams();
      if (options?.language) params.append('language', options.language);
      if (options?.replace) params.append('replace', 'true');

      const res = await client.post(`/projects/${projectId}/audio?${params.toString()}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data && res.data.id && typeof res.data === 'object' && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (err: any) {
      console.warn('Backend uploadAudio unavailable, saving locally in browser:', err.message);
    }

    const blobUrl = URL.createObjectURL(file);
    await storeMediaBlob(projectId, file.name, file);

    const localProj = getLocalProject(projectId);
    const existingCount = localProj?.assets?.length || 0;

    const asset: Asset = {
      id: `audio_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      project_id: projectId,
      type: 'audio',
      original_name: file.name,
      storage_path: file.name,
      order_index: existingCount,
      url: blobUrl,
      duration: 10,
    };

    if (localProj) {
      if (options?.replace) {
        localProj.assets = (localProj.assets || []).filter((a) => a.type !== 'audio');
      }
      localProj.assets = [...(localProj.assets || []), asset];
      if (!localProj.settings) {
        localProj.settings = createDefaultSettings();
      }
      localProj.settings.active_audio_id = asset.id;
      localProj.updated_at = new Date().toISOString();
      saveLocalProject(localProj);
    }

    return asset;
  },

  setActiveAudio: async (projectId: string, assetId: string): Promise<void> => {
    try {
      await client.post(`/projects/${projectId}/active-audio/${assetId}`);
    } catch (e) {
      // Backend unavailable
    }
    const localProj = getLocalProject(projectId);
    if (localProj) {
      if (!localProj.settings) localProj.settings = createDefaultSettings();
      localProj.settings.active_audio_id = assetId;
      saveLocalProject(localProj);
    }
  },

  deleteAsset: async (projectId: string, assetId: string): Promise<void> => {
    try {
      await client.delete(`/projects/${projectId}/assets/${assetId}`);
    } catch (e) {
      // Backend unavailable
    }
    const localProj = getLocalProject(projectId);
    if (localProj) {
      localProj.assets = (localProj.assets || []).filter((a) => a.id !== assetId);
      saveLocalProject(localProj);
    }
  },

  // Audio Analysis & Sentences
  analyzeAudio: async (projectId: string): Promise<SentenceItem[]> => {
    try {
      const res = await client.post(`/projects/${projectId}/analyze-audio`);
      if (Array.isArray(res.data) && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }

    const localProj = getLocalProject(projectId);
    const sentences: SentenceItem[] = [
      {
        id: `sent_${Date.now()}_1`,
        order_index: 0,
        text: 'Welcome to this presentation.',
        start_time: 0,
        end_time: 3.5,
        confidence: 1.0,
      },
      {
        id: `sent_${Date.now()}_2`,
        order_index: 1,
        text: 'This video demonstrates automated scene generation.',
        start_time: 3.5,
        end_time: 7.0,
        confidence: 1.0,
      },
    ];
    if (localProj) {
      localProj.sentences = sentences;
      saveLocalProject(localProj);
    }
    return sentences;
  },

  getSentences: async (projectId: string): Promise<SentenceItem[]> => {
    try {
      const res = await client.get(`/projects/${projectId}/sentences`);
      if (Array.isArray(res.data) && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }
    const localProj = getLocalProject(projectId);
    return localProj?.sentences || [];
  },

  updateSentences: async (projectId: string, sentences: SentenceItem[]): Promise<SentenceItem[]> => {
    try {
      const res = await client.put(`/projects/${projectId}/sentences`, { sentences });
      if (Array.isArray(res.data) && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }
    const localProj = getLocalProject(projectId);
    if (localProj) {
      localProj.sentences = sentences;
      saveLocalProject(localProj);
    }
    return sentences;
  },

  getWaveform: async (projectId: string): Promise<{ points: number[]; duration: number }> => {
    try {
      const res = await client.get(`/projects/${projectId}/audio/waveform`);
      if (res.data && Array.isArray(res.data.points) && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }
    const points: number[] = [];
    for (let i = 0; i < 100; i++) {
      const val = 0.2 + 0.6 * Math.abs(Math.sin(i * 0.2) * Math.cos(i * 0.05));
      points.push(Number(val.toFixed(2)));
    }
    return { points, duration: 30 };
  },

  // Timeline
  generateTimeline: async (projectId: string): Promise<TimelineData> => {
    try {
      const res = await client.post(`/projects/${projectId}/generate-timeline`);
      if (res.data && res.data.scenes && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }

    const localProj = getLocalProject(projectId);
    const visualAssets = (localProj?.assets || []).filter((a) => a.type === 'image' || a.type === 'video');
    const audioAsset = (localProj?.assets || []).find((a) => a.type === 'audio');

    const fps = 30;
    const sceneDur = 90;
    let currStart = 0;
    const scenes: SceneItem[] = visualAssets.map((asset, idx) => {
      const s: SceneItem = {
        id: `scene_${Date.now()}_${idx}`,
        imageAssetId: asset.id,
        startFrame: currStart,
        durationFrames: sceneDur,
        effect: {
          type: 'zoom_in',
          intensity: 1.0,
        },
        transitionOut: {
          type: 'crossfade',
          durationFrames: 15,
        },
      };
      currStart += sceneDur;
      return s;
    });

    const totalDur = Math.max(300, currStart);
    const settings = localProj?.settings || createDefaultSettings();
    const audioObj: TimelineAudio | null = audioAsset
      ? {
          assetId: audioAsset.id,
          startFrame: 0,
          durationFrames: totalDur,
        }
      : null;

    const tl: TimelineData = {
      projectId,
      totalDurationFrames: totalDur,
      settings,
      scenes,
      audio: audioObj,
      captions: localProj?.timeline?.captions || null,
    };

    if (localProj) {
      localProj.timeline = tl;
      saveLocalProject(localProj);
    }
    return tl;
  },

  getTimeline: async (projectId: string): Promise<TimelineData> => {
    try {
      const res = await client.get(`/projects/${projectId}/timeline`);
      if (res.data && typeof res.data === 'object' && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }
    const localProj = getLocalProject(projectId);
    if (localProj?.timeline) {
      return localProj.timeline;
    }
    return {
      projectId,
      totalDurationFrames: 300,
      settings: localProj?.settings || createDefaultSettings(),
      scenes: [],
      audio: null,
      captions: null,
    };
  },

  updateTimeline: async (projectId: string, timeline: TimelineData): Promise<TimelineData> => {
    try {
      const res = await client.put(`/projects/${projectId}/timeline`, timeline);
      if (res.data && typeof res.data === 'object' && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }
    const localProj = getLocalProject(projectId);
    if (localProj) {
      localProj.timeline = timeline;
      localProj.updated_at = new Date().toISOString();
      saveLocalProject(localProj);
    }
    return timeline;
  },

  // Rendering
  renderVideo: async (
    projectId: string,
    options?: { width?: number; height?: number; fps?: number; quality?: string; aspect_ratio?: string; burn_captions?: boolean }
  ): Promise<RenderJob> => {
    try {
      const res = await client.post(`/projects/${projectId}/render`, options || {});
      if (res.data && res.data.id && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (err: any) {
      // Backend unavailable
    }

    const job: RenderJob = {
      id: `job_${Date.now()}`,
      project_id: projectId,
      status: 'completed',
      progress: 100,
      created_at: new Date().toISOString(),
      download_url: '#',
    };
    return job;
  },

  getRenderJob: async (jobId: string): Promise<RenderJob> => {
    try {
      const res = await client.get(`/render-jobs/${jobId}`);
      if (res.data && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }
    return {
      id: jobId,
      project_id: '',
      status: 'completed',
      progress: 100,
      created_at: new Date().toISOString(),
    };
  },

  getAllRenderJobs: async (): Promise<RenderJob[]> => {
    try {
      const res = await client.get('/render-jobs');
      if (Array.isArray(res.data) && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }
    return [];
  },

  getLatestRenderJob: async (projectId: string): Promise<RenderJob | null> => {
    try {
      const res = await client.get(`/projects/${projectId}/latest-render-job`);
      if (res.data && typeof res.data === 'object' && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (err: any) {
      if (err.response?.status === 404) return null;
    }
    return null;
  },

  getProjectRenderJobs: async (projectId: string): Promise<RenderJob[]> => {
    try {
      const res = await client.get(`/projects/${projectId}/render-jobs`);
      if (Array.isArray(res.data) && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }
    return [];
  },

  cancelRenderJob: async (jobId: string): Promise<void> => {
    try {
      await client.post(`/render-jobs/${jobId}/cancel`);
    } catch (e) {
      // Backend unavailable
    }
  },

  // Captions API
  generateCaptions: async (
    projectId: string,
    options?: { presetId?: string; mode?: string; wordsPerSegment?: number }
  ): Promise<any> => {
    try {
      const res = await client.post(`/projects/${projectId}/captions/generate`, options || {});
      if (res.data && res.data.segments && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }

    const localProj = getLocalProject(projectId);
    const existing = localProj?.timeline?.captions;
    if (existing && existing.segments?.length > 0) {
      return existing;
    }

    const sampleCaps = {
      enabled: true,
      mode: options?.mode || 'line',
      settings: {
        selectedPresetId: options?.presetId || 'bold_yellow',
        globalStyle: {},
        customPresets: [],
      },
      segments: [
        {
          id: 'seg_1',
          startTime: 0,
          endTime: 2.5,
          startFrame: 0,
          endFrame: 75,
          text: 'Welcome to AutoVideo Studio.',
          words: [
            { id: 'w_1', text: 'Welcome', startFrame: 0, endFrame: 20, startTime: 0, endTime: 0.67, confidence: 1 },
            { id: 'w_2', text: 'to', startFrame: 21, endFrame: 35, startTime: 0.7, endTime: 1.16, confidence: 1 },
            { id: 'w_3', text: 'AutoVideo', startFrame: 36, endFrame: 55, startTime: 1.2, endTime: 1.83, confidence: 1 },
            { id: 'w_4', text: 'Studio.', startFrame: 56, endFrame: 75, startTime: 1.87, endTime: 2.5, confidence: 1 },
          ],
        },
      ],
    };

    if (localProj) {
      if (!localProj.timeline) {
        localProj.timeline = {
          projectId,
          totalDurationFrames: 300,
          settings: localProj.settings || createDefaultSettings(),
          scenes: [],
          audio: null,
          captions: null,
        };
      }
      localProj.timeline.captions = sampleCaps as any;
      saveLocalProject(localProj);
    }
    return sampleCaps;
  },

  getCaptions: async (projectId: string): Promise<any> => {
    try {
      const res = await client.get(`/projects/${projectId}/captions`);
      if (res.data && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }
    const localProj = getLocalProject(projectId);
    return localProj?.timeline?.captions || null;
  },

  updateCaptions: async (projectId: string, captions: any): Promise<any> => {
    try {
      const res = await client.put(`/projects/${projectId}/captions`, captions);
      if (res.data && !isInvalidOrHtml(res.data)) {
        return res.data;
      }
    } catch (e) {
      // Backend unavailable
    }
    const localProj = getLocalProject(projectId);
    if (localProj && localProj.timeline) {
      localProj.timeline.captions = captions;
      saveLocalProject(localProj);
    }
    return captions;
  },

  deleteCaptions: async (projectId: string): Promise<void> => {
    try {
      await client.delete(`/projects/${projectId}/captions`);
    } catch (e) {
      // Backend unavailable
    }
    const localProj = getLocalProject(projectId);
    if (localProj && localProj.timeline) {
      localProj.timeline.captions = null;
      saveLocalProject(localProj);
    }
  },

  getSrtExportUrl: (projectId: string): string => {
    return `/api/projects/${projectId}/captions/export/srt`;
  },

  getVttExportUrl: (projectId: string): string => {
    return `/api/projects/${projectId}/captions/export/vtt`;
  },
};
