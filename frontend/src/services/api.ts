import axios from 'axios';
import { ProjectDetail, ProjectSettings, Asset, SentenceItem, TimelineData, RenderJob } from '../types/timeline';

const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  if (envUrl) {
    return envUrl.endsWith('/api') ? envUrl : `${envUrl.replace(/\/$/, '')}/api`;
  }
  return '/api';
};

const client = axios.create({
  baseURL: getBaseUrl(),
});

export const api = {
  // System Health
  getHealth: async () => {
    const res = await client.get('/health');
    return res.data;
  },

  // Projects
  getProjects: async (): Promise<ProjectDetail[]> => {
    const res = await client.get('/projects');
    return Array.isArray(res.data) ? res.data : [];
  },

  createProject: async (name: string, settings?: Partial<ProjectSettings>): Promise<ProjectDetail> => {
    const res = await client.post('/projects', { name, settings });
    return res.data;
  },

  getProject: async (id: string): Promise<ProjectDetail> => {
    const res = await client.get(`/projects/${id}`);
    return res.data;
  },

  updateProject: async (id: string, data: { name?: string; settings?: ProjectSettings; script?: string }): Promise<ProjectDetail> => {
    const res = await client.put(`/projects/${id}`, data);
    return res.data;
  },

  deleteProject: async (id: string): Promise<void> => {
    await client.delete(`/projects/${id}`);
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

    const CHUNK_SIZE = 12;
    const allUploaded: Asset[] = [];
    const allUnsupported: { filename: string; reason: string }[] = [];
    const totalFiles = sorted.length;

    if (totalFiles === 0) {
      return { uploaded: [], unsupported: [], total_uploaded: 0 };
    }

    for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
      const chunk = sorted.slice(i, i + CHUNK_SIZE);
      const formData = new FormData();
      chunk.forEach((f) => formData.append('files', f));

      const res = await client.post(`/projects/${projectId}/media`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = res.data;
      if (data.uploaded) allUploaded.push(...data.uploaded);
      if (data.unsupported) allUnsupported.push(...data.unsupported);

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
    const formData = new FormData();
    formData.append('file', file);
    const params = new URLSearchParams();
    if (options?.language) params.append('language', options.language);
    if (options?.replace) params.append('replace', 'true');

    const res = await client.post(`/projects/${projectId}/audio?${params.toString()}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  setActiveAudio: async (projectId: string, assetId: string): Promise<void> => {
    await client.post(`/projects/${projectId}/active-audio/${assetId}`);
  },

  deleteAsset: async (projectId: string, assetId: string): Promise<void> => {
    await client.delete(`/projects/${projectId}/assets/${assetId}`);
  },

  // Audio Analysis & Sentences
  analyzeAudio: async (projectId: string): Promise<SentenceItem[]> => {
    const res = await client.post(`/projects/${projectId}/analyze-audio`);
    return res.data;
  },

  getSentences: async (projectId: string): Promise<SentenceItem[]> => {
    const res = await client.get(`/projects/${projectId}/sentences`);
    return res.data;
  },

  updateSentences: async (projectId: string, sentences: SentenceItem[]): Promise<SentenceItem[]> => {
    const res = await client.put(`/projects/${projectId}/sentences`, { sentences });
    return res.data;
  },

  getWaveform: async (projectId: string): Promise<{ points: number[]; duration: number }> => {
    const res = await client.get(`/projects/${projectId}/audio/waveform`);
    return res.data;
  },

  // Timeline
  generateTimeline: async (projectId: string): Promise<TimelineData> => {
    const res = await client.post(`/projects/${projectId}/generate-timeline`);
    return res.data;
  },

  getTimeline: async (projectId: string): Promise<TimelineData> => {
    const res = await client.get(`/projects/${projectId}/timeline`);
    return res.data;
  },

  updateTimeline: async (projectId: string, timeline: TimelineData): Promise<TimelineData> => {
    const res = await client.put(`/projects/${projectId}/timeline`, timeline);
    return res.data;
  },

  // Rendering with Resolution & Captions Options
  renderVideo: async (projectId: string, options?: { width?: number; height?: number; fps?: number; quality?: string; aspect_ratio?: string; burn_captions?: boolean }): Promise<RenderJob> => {
    const res = await client.post(`/projects/${projectId}/render`, options || {});
    return res.data;
  },

  getRenderJob: async (jobId: string): Promise<RenderJob> => {
    const res = await client.get(`/render-jobs/${jobId}`);
    return res.data;
  },

  getAllRenderJobs: async (): Promise<RenderJob[]> => {
    const res = await client.get('/render-jobs');
    return Array.isArray(res.data) ? res.data : [];
  },

  getLatestRenderJob: async (projectId: string): Promise<RenderJob | null> => {
    try {
      const res = await client.get(`/projects/${projectId}/latest-render-job`);
      return res.data && typeof res.data === 'object' ? res.data : null;
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  },

  getProjectRenderJobs: async (projectId: string): Promise<RenderJob[]> => {
    const res = await client.get(`/projects/${projectId}/render-jobs`);
    return Array.isArray(res.data) ? res.data : [];
  },

  cancelRenderJob: async (jobId: string): Promise<void> => {
    await client.post(`/render-jobs/${jobId}/cancel`);
  },

  // Captions API
  generateCaptions: async (projectId: string, options?: { presetId?: string; mode?: string; wordsPerSegment?: number }): Promise<any> => {
    const res = await client.post(`/projects/${projectId}/captions/generate`, options || {});
    return res.data;
  },

  getCaptions: async (projectId: string): Promise<any> => {
    const res = await client.get(`/projects/${projectId}/captions`);
    return res.data;
  },

  updateCaptions: async (projectId: string, captions: any): Promise<any> => {
    const res = await client.put(`/projects/${projectId}/captions`, captions);
    return res.data;
  },

  deleteCaptions: async (projectId: string): Promise<void> => {
    await client.delete(`/projects/${projectId}/captions`);
  },

  getSrtExportUrl: (projectId: string): string => {
    return `/api/projects/${projectId}/captions/export/srt`;
  },

  getVttExportUrl: (projectId: string): string => {
    return `/api/projects/${projectId}/captions/export/vtt`;
  },
};
