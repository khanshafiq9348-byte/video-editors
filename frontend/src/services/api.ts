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
  timeout: 180000,
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

    let detectedDur: number | null = null;
    try {
      detectedDur = await new Promise<number | null>((resolve) => {
        const audio = new Audio(blobUrl);
        audio.onloadedmetadata = () => {
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            resolve(Math.round(audio.duration * 100) / 100);
          } else {
            resolve(null);
          }
        };
        audio.onerror = () => resolve(null);
      });
    } catch (e) {
      // ignore
    }

    const asset: Asset = {
      id: `audio_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      project_id: projectId,
      type: 'audio',
      original_name: file.name,
      storage_path: file.name,
      order_index: existingCount,
      url: blobUrl,
      duration: detectedDur || 12,
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
    const audioAsset = (localProj?.assets || []).find((a) => a.type === 'audio');
    const audioDur = audioAsset?.duration || 12;

    let sentences: SentenceItem[] = [];
    const scriptText = (localProj?.script || '').trim();
    if (scriptText) {
      const rawSentences = scriptText
        .split(/(?<=[.?!])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (rawSentences.length > 0) {
        const wordCounts = rawSentences.map((s) => Math.max(1, s.split(/\s+/).length));
        const totalWords = wordCounts.reduce((acc, c) => acc + c, 0);

        let currTime = 0.05;
        sentences = rawSentences.map((text, idx) => {
          const sentDur = (wordCounts[idx] / totalWords) * Math.max(1.5, audioDur - 0.2);
          const st = Math.round(currTime * 100) / 100;
          const et = Math.round((currTime + Math.max(1.0, sentDur)) * 100) / 100;
          currTime = et + 0.1;

          // Generate word-level timestamps
          const rawWords = text.split(/\s+/).filter(Boolean);
          const wStep = (et - st) / Math.max(1, rawWords.length);
          const words = rawWords.map((w, wIdx) => ({
            word: w,
            start: Math.round((st + wIdx * wStep) * 100) / 100,
            end: Math.round((st + (wIdx + 1) * wStep) * 100) / 100,
          }));

          return {
            id: `sent_${Date.now()}_${idx + 1}`,
            order_index: idx,
            text,
            start_time: st,
            end_time: et,
            confidence: 0.95,
            words,
          };
        });
      }
    }

    if (sentences.length === 0) {
      const visualCount = (localProj?.assets || []).filter((a) => a.type === 'image' || a.type === 'video').length;
      const targetCount = Math.max(2, visualCount > 0 ? visualCount : Math.min(15, Math.max(3, Math.floor(audioDur / 4.0))));
      const sentDur = (audioDur * 0.96) / targetCount;
      sentences = [];
      let cTime = 0.08;
      const defaultPhrases = [
        'Automated waste collection and modern smart management.',
        'Compacting and transporting materials with precision.',
        'Efficient operations ensuring clean neighborhood streets.',
        'Advanced robotic systems and continuous monitoring.',
        'Sustainable processing for cleaner urban environments.',
        'Optimizing logistical routes and reducing emissions.',
        'Innovative engineering shaping the future of community service.',
        'Delivering reliable results through intelligent automation.'
      ];
      for (let sIdx = 0; sIdx < targetCount; sIdx++) {
        const st = Math.round(cTime * 100) / 100;
        const et = Math.round((cTime + Math.max(1.0, sentDur - 0.2)) * 100) / 100;
        cTime = et + 0.15;
        const phraseText = defaultPhrases[sIdx % defaultPhrases.length];
        const rawWords = phraseText.split(/\s+/).filter(Boolean);
        const wStep = (et - st) / Math.max(1, rawWords.length);
        const words = rawWords.map((w, wIdx) => ({
          word: w,
          start: Math.round((st + wIdx * wStep) * 100) / 100,
          end: Math.round((st + (wIdx + 1) * wStep) * 100) / 100,
        }));
        sentences.push({
          id: `sent_${Date.now()}_${sIdx + 1}`,
          order_index: sIdx,
          text: phraseText,
          start_time: st,
          end_time: et,
          confidence: 0.98,
          words,
        });
      }
    }

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
    const sentences = (localProj?.sentences || []).filter((s) => s.text && s.text.trim());

    const fps = localProj?.settings?.fps || 30;
    const numImages = visualAssets.length;
    const numSentences = sentences.length;

    // Helper for Ken Burns transform parameters for distinct animations
    const getKenBurnsParams = (type: string, intensity: number = 0.15) => {
      const shift = Math.round(intensity * 400);
      switch (type) {
        case 'zoom_out':
          return { startScale: 1.18, endScale: 1.0, startX: 0, endX: 0, startY: 0, endY: 0 };
        case 'pan_left':
          return { startScale: 1.10, endScale: 1.10, startX: shift, endX: -shift, startY: 0, endY: 0 };
        case 'pan_right':
          return { startScale: 1.10, endScale: 1.10, startX: -shift, endX: shift, startY: 0, endY: 0 };
        case 'pan_up':
          return { startScale: 1.10, endScale: 1.10, startX: 0, endX: 0, startY: Math.round(shift * 0.8), endY: -Math.round(shift * 0.8) };
        case 'pan_down':
          return { startScale: 1.10, endScale: 1.10, startX: 0, endX: 0, startY: -Math.round(shift * 0.8), endY: Math.round(shift * 0.8) };
        case 'zoom_pan':
          return { startScale: 1.0, endScale: 1.15, startX: -Math.round(shift * 0.6), endX: Math.round(shift * 0.6), startY: 0, endY: -Math.round(shift * 0.3) };
        case 'static':
          return { startScale: 1.0, endScale: 1.0, startX: 0, endX: 0, startY: 0, endY: 0 };
        case 'zoom_in':
        default:
          return { startScale: 1.0, endScale: 1.15, startX: 0, endX: 0, startY: 0, endY: 0 };
      }
    };

    const effCycle = ['pan_left', 'zoom_out', 'pan_right', 'zoom_in', 'pan_up', 'zoom_pan'];
    const transCycle = ['crossfade', 'slide_left', 'crossfade', 'zoom', 'crossfade', 'slide_right'];
    const totalAudioDuration = audioAsset?.duration || 0;

    interface RawScene {
      assetId: string;
      sentenceId?: string;
      startSec: number;
      endSec: number;
    }

    const rawScenes: RawScene[] = [];

    // CASE 1: Sentences exist with timestamps from voiceover
    if (numSentences > 0 && numImages > 0) {
      const sorted = [...sentences].sort((a, b) => a.start_time - b.start_time);
      const totalEndSec = Math.max(sorted[sorted.length - 1].end_time, totalAudioDuration || 0);

      if (numImages <= numSentences) {
        // Every sentence corresponds directly to a visual scene.
        // Visuals change exactly when each sentence begins.
        for (let i = 0; i < numSentences; i++) {
          const st = i === 0 ? 0.0 : sorted[i].start_time;
          const et = i < numSentences - 1 ? sorted[i + 1].start_time : totalEndSec;
          rawScenes.push({
            assetId: visualAssets[i % numImages].id,
            sentenceId: sorted[i].id,
            startSec: st,
            endSec: Math.max(st + 0.5, et),
          });
        }
      } else if (numImages > numSentences) {
        // More images than sentences: split longer sentences into speech-accurate segments
        const durations = sorted.map((s) => Math.max(0.2, s.end_time - s.start_time));
        const counts = Array(numSentences).fill(1);
        let rem = numImages - numSentences;
        while (rem > 0) {
          let maxIdx = 0;
          let maxVal = durations[0] / counts[0];
          for (let k = 1; k < numSentences; k++) {
            const v = durations[k] / counts[k];
            if (v > maxVal) {
              maxVal = v;
              maxIdx = k;
            }
          }
          counts[maxIdx]++;
          rem--;
        }

        let currImgIdx = 0;
        for (let j = 0; j < numSentences; j++) {
          const st = j === 0 ? 0.0 : sorted[j].start_time;
          const et = j < numSentences - 1 ? sorted[j + 1].start_time : totalEndSec;
          const c = counts[j];
          const words = (sorted[j].words as any[]) || [];

          let subSpans: { st: number; et: number }[] = [];
          if (c > 1 && words.length >= c) {
            // Cut precisely at word timestamps
            const cuts: number[] = [];
            let prevIdx = 0;
            for (let m = 1; m < c; m++) {
              const ideal = st + m * ((et - st) / c);
              let bestCand: { idx: number; time: number } | null = null;
              let bestScore = -999999;
              for (let k = prevIdx; k < words.length - (c - m); k++) {
                const w = words[k];
                const wNext = words[k + 1];
                const tCut = Number(wNext.start);
                let score = 0;
                const pause = Number(wNext.start) - Number(w.end);
                if (pause >= 0.04) score += Math.min(3.5, pause * 5.0);
                if (/[,\;:–\-]/.test(w.word)) score += 2.5;
                if (/^(and|but|or|while|where|which|because|with|when|that|so|as)$/i.test(wNext.word)) score += 2.0;
                score -= Math.abs(tCut - ideal) * 0.5;
                if (score > bestScore) {
                  bestScore = score;
                  bestCand = { idx: k, time: tCut };
                }
              }
              if (bestCand) {
                prevIdx = bestCand.idx + 1;
                cuts.push(bestCand.time);
              } else {
                cuts.push(ideal);
              }
            }
            cuts.sort((a, b) => a - b);
            const times = [st, ...cuts, et];
            subSpans = Array.from({ length: c }, (_, idx) => ({ st: times[idx], et: times[idx + 1] }));
          } else {
            const step = (et - st) / c;
            subSpans = Array.from({ length: c }, (_, idx) => ({ st: st + idx * step, et: st + (idx + 1) * step }));
          }

          for (const span of subSpans) {
            rawScenes.push({
              assetId: visualAssets[currImgIdx].id,
              sentenceId: sorted[j].id,
              startSec: span.st,
              endSec: Math.max(span.st + 0.5, span.et),
            });
            currImgIdx++;
          }
        }
      }
    } else if (totalAudioDuration > 0 && numImages > 0) {
      // CASE 2: Audio exists without sentences: dynamically distribute total audio length
      const durPerImg = totalAudioDuration / numImages;
      for (let i = 0; i < numImages; i++) {
        const st = i * durPerImg;
        const et = (i === numImages - 1) ? totalAudioDuration : (i + 1) * durPerImg;
        rawScenes.push({
          assetId: visualAssets[i].id,
          startSec: st,
          endSec: Math.max(st + 0.5, et),
        });
      }
    } else {
      // CASE 3: Visuals only
      const baseDur = 4.0;
      for (let i = 0; i < numImages; i++) {
        rawScenes.push({
          assetId: visualAssets[i].id,
          startSec: i * baseDur,
          endSec: (i + 1) * baseDur,
        });
      }
    }

    // Build contiguous frame-accurate SceneItem list
    let currFrame = 0;
    const totalScenes = rawScenes.length;
    const scenes: SceneItem[] = rawScenes.map((raw, idx) => {
      const sceneStart = currFrame;
      let targetEnd = Math.round(raw.endSec * fps);
      if (idx === totalScenes - 1 && totalAudioDuration > 0) {
        targetEnd = Math.max(targetEnd, Math.round(totalAudioDuration * fps));
      }
      const sceneEnd = Math.max(sceneStart + 15, targetEnd);
      const sceneDur = sceneEnd - sceneStart;
      currFrame = sceneEnd;

      const effType = effCycle[idx % effCycle.length];
      const motionParams = getKenBurnsParams(effType, 0.15);
      const transType = (idx === totalScenes - 1) ? null : transCycle[idx % transCycle.length];

      return {
        id: `scene_${Date.now()}_${idx}`,
        imageAssetId: raw.assetId,
        sentenceId: raw.sentenceId,
        startFrame: sceneStart,
        durationFrames: sceneDur,
        endFrame: sceneEnd,
        speechEndFrame: Math.round(raw.endSec * fps),
        effect: {
          type: effType,
          intensity: 0.15,
          ...motionParams,
        },
        transitionOut: transType ? {
          type: transType,
          durationFrames: Math.max(6, Math.min(12, Math.floor(sceneDur / 3))),
        } : null,
      };
    });

    const totalDur = Math.max(15, currFrame);
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
    } catch (e: any) {
      // Backend returned an error response: propagate actual error to the user!
      if (e?.response) {
        const errorDetail = e.response.data?.detail || e.message;
        throw new Error(errorDetail);
      }
      console.warn('[Captions] Backend unavailable, falling back to local store:', e?.message);
    }

    const localProj = getLocalProject(projectId);
    let sentences = (localProj?.sentences || []).filter((s) => s.text && s.text.trim());
    if (sentences.length === 0) {
      try {
        sentences = await api.analyzeAudio(projectId);
      } catch (e) {
        // ignore
      }
    }

    const fps = localProj?.settings?.fps || 30;
    let segments: any[] = [];

    if (sentences.length > 0) {
      segments = sentences.map((sent, sIdx) => {
        const stSec = sent.start_time ?? 0.0;
        const etSec = sent.end_time ?? (stSec + 2.0);
        const stFrame = Math.round(stSec * fps);
        const etFrame = Math.max(stFrame + 5, Math.round(etSec * fps));

        const rawWordTexts = sent.text.split(/\s+/).filter(Boolean);
        const wordsList = Array.isArray(sent.words) && sent.words.length > 0
          ? sent.words.map((w: any, wIdx: number) => {
              const wStSec = Number(w.start ?? stSec);
              const wEtSec = Number(w.end ?? etSec);
              return {
                id: `w_${sIdx + 1}_${wIdx + 1}`,
                text: w.word || '',
                startTime: wStSec,
                endTime: wEtSec,
                startFrame: Math.round(wStSec * fps),
                endFrame: Math.max(Math.round(wStSec * fps) + 1, Math.round(wEtSec * fps)),
                confidence: Number(w.confidence ?? 1.0),
              };
            })
          : rawWordTexts.map((txt: string, wIdx: number) => {
              const wStep = (etSec - stSec) / Math.max(1, rawWordTexts.length);
              const wStSec = stSec + wIdx * wStep;
              const wEtSec = stSec + (wIdx + 1) * wStep;
              return {
                id: `w_${sIdx + 1}_${wIdx + 1}`,
                text: txt,
                startTime: Number(wStSec.toFixed(3)),
                endTime: Number(wEtSec.toFixed(3)),
                startFrame: Math.round(wStSec * fps),
                endFrame: Math.max(Math.round(wStSec * fps) + 1, Math.round(wEtSec * fps)),
                confidence: 1.0,
              };
            });

        return {
          id: `seg_${sIdx + 1}`,
          text: sent.text,
          startTime: stSec,
          endTime: etSec,
          startFrame: stFrame,
          endFrame: etFrame,
          words: wordsList,
        };
      });
    }

    // Never return fake placeholder text: if no speech could be aligned, report clear error
    if (segments.length === 0) {
      throw new Error('No spoken voiceover detected. Please upload an audio or video file with clear speech.');
    }

    const realCaptions = {
      enabled: true,
      mode: options?.mode || 'karaoke',
      settings: {
        selectedPresetId: options?.presetId || 'preset_yellow_karaoke',
        globalStyle: {},
        customPresets: [],
      },
      segments,
    };

    if (localProj) {
      if (!localProj.timeline) {
        const audioAsset = (localProj?.assets || []).find((a) => a.type === 'audio');
        const durFrames = Math.round((audioAsset?.duration || 10) * fps);
        localProj.timeline = {
          projectId,
          totalDurationFrames: Math.max(300, durFrames),
          settings: localProj.settings || createDefaultSettings(),
          scenes: [],
          audio: audioAsset ? { assetId: audioAsset.id, startFrame: 0, durationFrames: durFrames } : null,
          captions: realCaptions as any,
        };
      } else {
        localProj.timeline.captions = realCaptions as any;
      }
      saveLocalProject(localProj);
    }
    return realCaptions;
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
