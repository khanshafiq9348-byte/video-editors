import { ProjectDetail, Asset, ProjectSettings, TimelineData } from '../types/timeline';

const STORAGE_KEY = 'autovideo_local_projects';
const DB_NAME = 'autovideo_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';

// Open IndexedDB database for persistent media storage
function openMediaDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/** Store a media file blob in IndexedDB */
export async function storeMediaBlob(projectId: string, filename: string, blob: Blob): Promise<void> {
  try {
    const db = await openMediaDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const key = `${projectId}___${filename}`;
    store.put(blob, key);
  } catch (e) {
    console.warn('IndexedDB storeMediaBlob error:', e);
  }
}

/** Retrieve a media file blob from IndexedDB */
export async function getMediaBlob(projectId: string, filename: string): Promise<Blob | null> {
  try {
    const db = await openMediaDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const key = `${projectId}___${filename}`;
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

/** Delete all media blobs for a project */
export async function deleteProjectMediaBlobs(projectId: string): Promise<void> {
  try {
    const db = await openMediaDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (cursor) {
        if (typeof cursor.key === 'string' && cursor.key.startsWith(`${projectId}___`)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch (e) {
    console.warn('Failed to clean up project media blobs:', e);
  }
}

/** Read all locally stored projects from localStorage */
export function getLocalProjects(): ProjectDetail[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to parse local projects:', e);
    return [];
  }
}

/** Get a single local project by id */
export function getLocalProject(id: string): ProjectDetail | null {
  const projects = getLocalProjects();
  return projects.find((p) => p.id === id) || null;
}

/** Save or update a local project */
export function saveLocalProject(project: ProjectDetail): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const projects = getLocalProjects();
    const idx = projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) {
      projects[idx] = project;
    } else {
      projects.unshift(project);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn('Failed to save local project:', e);
  }
}

/** Delete a local project */
export function deleteLocalProject(id: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const projects = getLocalProjects().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    deleteProjectMediaBlobs(id);
  } catch (e) {
    console.warn('Failed to delete local project:', e);
  }
}

export function createDefaultSettings(partial?: Partial<ProjectSettings>): ProjectSettings {
  const ratio = partial?.aspect_ratio || '16:9';
  const width = partial?.width || (ratio === '9:16' ? 1080 : 1920);
  const height = partial?.height || (ratio === '9:16' ? 1920 : (ratio === '1:1' ? 1080 : 1080));
  return {
    width,
    height,
    aspect_ratio: ratio,
    fps: partial?.fps || 30,
    preset: partial?.preset || 'dynamic_youtube',
    alignment_mode: partial?.alignment_mode || 'auto',
    effect_style: partial?.effect_style || 'subtle_zoom',
    transition_style: partial?.transition_style || 'crossfade',
    transition_duration_seconds: partial?.transition_duration_seconds ?? 0.5,
    animation_intensity: partial?.animation_intensity || 'medium',
    fit_mode: partial?.fit_mode || 'fill',
    color_tone: partial?.color_tone || 'original',
    project_mode: partial?.project_mode || 'single_language',
    primary_language: partial?.primary_language,
    available_languages: partial?.available_languages || [],
    active_audio_id: partial?.active_audio_id || null,
  };
}

/** Create a new local project */
export function createPersistentLocalProject(name: string, settings?: Partial<ProjectSettings>): ProjectDetail {
  const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const defaultSettings = createDefaultSettings(settings);

  const timeline: TimelineData = {
    projectId: id,
    settings: defaultSettings,
    scenes: [],
    audio: null,
    totalDurationFrames: 300,
    captions: null,
  };

  const newProj: ProjectDetail = {
    id,
    name,
    settings: defaultSettings,
    assets: [],
    sentences: [],
    timeline,
    created_at: now,
    updated_at: now,
  };

  saveLocalProject(newProj);
  return newProj;
}

/** Rehydrate asset Blob URLs on page reload */
export async function rehydrateProjectAssets(project: ProjectDetail): Promise<ProjectDetail> {
  if (!project.assets || project.assets.length === 0) return project;

  const updatedAssets = await Promise.all(
    project.assets.map(async (asset) => {
      if (asset.original_name) {
        const storedBlob = await getMediaBlob(project.id, asset.original_name);
        if (storedBlob) {
          const freshUrl = URL.createObjectURL(storedBlob);
          return { ...asset, url: freshUrl };
        }
      }
      return asset;
    })
  );

  let updatedTimeline = project.timeline;
  if (updatedTimeline) {
    const scenes = Array.isArray(updatedTimeline.scenes)
      ? updatedTimeline.scenes.map((s) => {
          const match = updatedAssets.find((a) => a.id === s.imageAssetId);
          return match ? { ...s, imageUrl: match.url } : s;
        })
      : [];

    updatedTimeline = { ...updatedTimeline, scenes };
  }

  return {
    ...project,
    assets: updatedAssets,
    timeline: updatedTimeline,
  };
}
