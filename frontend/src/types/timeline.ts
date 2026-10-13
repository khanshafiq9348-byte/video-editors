export interface ProjectSettings {
  width: number;
  height: number;
  aspect_ratio?: '16:9' | '9:16' | '1:1' | string;
  fps: number;
  preset: string; // 'documentary' | 'storytelling' | 'dynamic_youtube' | 'minimal'
  alignment_mode: string;
  effect_style: string;
  transition_style: string;
  transition_duration_seconds: number;
  animation_intensity: 'low' | 'medium' | 'high';
  fit_mode?: 'fill' | 'fit' | 'blur_background';
  color_tone?: 'original' | 'warm' | 'cool' | 'cinematic';
  project_mode?: 'single_language' | 'multi_language';
  primary_language?: string;
  available_languages?: string[];
  active_audio_id?: string | null;
}

export interface Asset {
  id: string;
  project_id: string;
  type: 'image' | 'video' | 'audio';
  original_name: string;
  storage_path: string;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  order_index: number;
  url: string;
}

export interface SentenceItem {
  id: string;
  order_index: number;
  text: string;
  start_time: number;
  end_time: number;
  confidence: number;
}

export interface SceneEffect {
  type: string;
  intensity: number;
  startScale?: number;
  endScale?: number;
  startX?: number;
  endX?: number;
  startY?: number;
  endY?: number;
}

export interface SceneTransition {
  type: string;
  durationFrames: number;
}

export interface SceneItem {
  id: string;
  imageAssetId: string;
  sentenceId?: string | null;
  startFrame: number;
  durationFrames: number;
  endFrame?: number;
  effect: SceneEffect;
  transitionOut?: SceneTransition | null;
  fitMode?: 'fill' | 'fit' | 'blur_background';
  colorTone?: 'original' | 'warm' | 'cool' | 'cinematic';
}

export interface TimelineAudio {
  assetId: string;
  startFrame: number;
  durationFrames?: number | null;
}

import { TimelineCaptions } from './captions';

export interface TimelineData {
  projectId: string;
  settings: ProjectSettings;
  audio?: TimelineAudio | null;
  scenes: SceneItem[];
  totalDurationFrames: number;
  captions?: TimelineCaptions | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  settings: ProjectSettings;
  script?: string | null;
  assets: Asset[];
  sentences: SentenceItem[];
  timeline?: TimelineData | null;
}

export interface RenderJob {
  id: string;
  project_id: string;
  project_name?: string;
  status: 'pending' | 'queued' | 'rendering' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  output_path?: string | null;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
  download_url?: string | null;
  queue_position?: number | null;
}
