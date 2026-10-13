export type CaptionMode = 'classic' | 'word_by_word' | 'karaoke' | 'word_pop' | 'phrase';

export type CaptionCategory = 'all' | 'classic' | 'youtube' | 'karaoke' | 'cinematic' | 'animated' | 'minimal';

export type CaptionAnimationType =
  | 'none'
  | 'fade_in'
  | 'fade_out'
  | 'pop'
  | 'scale_up'
  | 'slide_up'
  | 'slide_down'
  | 'bounce'
  | 'word_highlight'
  | 'typewriter'
  | 'smooth_zoom'
  | 'word_pulse';

export interface CaptionWord {
  id: string;
  text: string;
  startFrame: number;
  endFrame: number;
  startTime?: number;
  endTime?: number;
  confidence?: number;
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  uppercase: boolean;

  textColor: string;
  highlightColor: string;

  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundPadding: number;
  backgroundRadius: number;

  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;

  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;

  letterSpacing: number;
  lineHeight: number;

  textAlign: 'left' | 'center' | 'right';

  positionX: number; // percentage (0 - 100)
  positionY: number; // percentage (0 - 100)

  animationType: CaptionAnimationType;
  animationIntensity: number;
}

export interface CaptionPreset {
  id: string;
  name: string;
  category: CaptionCategory;
  mode: CaptionMode;
  style: CaptionStyle;
  isCustom?: boolean;
}

export interface CaptionSegment {
  id: string;
  text: string;
  startFrame: number;
  endFrame: number;
  startTime?: number;
  endTime?: number;
  words: CaptionWord[];
  styleOverride?: Partial<CaptionStyle>;
}

export interface CaptionSettings {
  enabled: boolean;
  mode: CaptionMode;
  selectedPresetId: string;
  globalStyle: CaptionStyle;
  customPresets?: CaptionPreset[];
}

export interface TimelineCaptions {
  settings: CaptionSettings;
  segments: CaptionSegment[];
}

export const BUILTIN_CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: 'preset_classic_white',
    name: 'Classic White',
    category: 'classic',
    mode: 'classic',
    style: {
      fontFamily: 'Inter',
      fontSize: 44,
      fontWeight: 600,
      italic: false,
      uppercase: false,
      textColor: '#FFFFFF',
      highlightColor: '#FFFFFF',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.6,
      backgroundPadding: 10,
      backgroundRadius: 6,
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 3,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.7)',
      shadowBlur: 4,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      letterSpacing: 0,
      lineHeight: 1.2,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 85.0,
      animationType: 'none',
      animationIntensity: 1.0,
    },
    isCustom: false,
  },
  {
    id: 'preset_youtube_bold',
    name: 'YouTube Bold',
    category: 'youtube',
    mode: 'word_pop',
    style: {
      fontFamily: 'Impact',
      fontSize: 54,
      fontWeight: 900,
      italic: false,
      uppercase: true,
      textColor: '#FFFFFF',
      highlightColor: '#FFE500',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.7,
      backgroundPadding: 12,
      backgroundRadius: 8,
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 6,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.8)',
      shadowBlur: 8,
      shadowOffsetX: 2,
      shadowOffsetY: 4,
      letterSpacing: 1.0,
      lineHeight: 1.1,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 80.0,
      animationType: 'pop',
      animationIntensity: 1.15,
    },
    isCustom: false,
  },
  {
    id: 'preset_yellow_karaoke',
    name: 'Yellow Karaoke',
    category: 'karaoke',
    mode: 'karaoke',
    style: {
      fontFamily: 'Inter',
      fontSize: 48,
      fontWeight: 800,
      italic: false,
      uppercase: true,
      textColor: '#FFFFFF',
      highlightColor: '#FFDE03',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.5,
      backgroundPadding: 12,
      backgroundRadius: 8,
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 4,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.75)',
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      letterSpacing: 0.5,
      lineHeight: 1.2,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 82.0,
      animationType: 'word_highlight',
      animationIntensity: 1.0,
    },
    isCustom: false,
  },
  {
    id: 'preset_cinematic_white',
    name: 'Cinematic White',
    category: 'cinematic',
    mode: 'classic',
    style: {
      fontFamily: 'Georgia',
      fontSize: 40,
      fontWeight: 500,
      italic: true,
      uppercase: false,
      textColor: '#F8F9FA',
      highlightColor: '#F8F9FA',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.5,
      backgroundPadding: 10,
      backgroundRadius: 4,
      strokeEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 0,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.85)',
      shadowBlur: 10,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      letterSpacing: 1.2,
      lineHeight: 1.3,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 88.0,
      animationType: 'fade_in',
      animationIntensity: 1.0,
    },
    isCustom: false,
  },
  {
    id: 'preset_viral_shorts',
    name: 'Viral Shorts',
    category: 'youtube',
    mode: 'word_pop',
    style: {
      fontFamily: 'Impact',
      fontSize: 58,
      fontWeight: 900,
      italic: false,
      uppercase: true,
      textColor: '#FFFFFF',
      highlightColor: '#00FF66',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.7,
      backgroundPadding: 14,
      backgroundRadius: 10,
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 7,
      shadowEnabled: true,
      shadowColor: 'rgba(0, 0, 0, 0.9)',
      shadowBlur: 12,
      shadowOffsetX: 0,
      shadowOffsetY: 5,
      letterSpacing: 1.0,
      lineHeight: 1.15,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 55.0,
      animationType: 'bounce',
      animationIntensity: 1.2,
    },
    isCustom: false,
  },
  {
    id: 'preset_minimal_clean',
    name: 'Minimal Clean',
    category: 'minimal',
    mode: 'phrase',
    style: {
      fontFamily: 'Inter',
      fontSize: 38,
      fontWeight: 500,
      italic: false,
      uppercase: false,
      textColor: '#FFFFFF',
      highlightColor: '#FFFFFF',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.4,
      backgroundPadding: 8,
      backgroundRadius: 4,
      strokeEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 0,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.6)',
      shadowBlur: 4,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      letterSpacing: 0.5,
      lineHeight: 1.25,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 85.0,
      animationType: 'none',
      animationIntensity: 1.0,
    },
    isCustom: false,
  },
  {
    id: 'preset_neon_cyan',
    name: 'Neon Cyan',
    category: 'animated',
    mode: 'karaoke',
    style: {
      fontFamily: 'Inter',
      fontSize: 48,
      fontWeight: 800,
      italic: false,
      uppercase: true,
      textColor: '#00FFFF',
      highlightColor: '#FF007F',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.7,
      backgroundPadding: 12,
      backgroundRadius: 8,
      strokeEnabled: true,
      strokeColor: '#0A1128',
      strokeWidth: 4,
      shadowEnabled: true,
      shadowColor: '#00F0FF',
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      letterSpacing: 1.5,
      lineHeight: 1.2,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 82.0,
      animationType: 'slide_up',
      animationIntensity: 1.0,
    },
    isCustom: false,
  },
  {
    id: 'preset_comic_pop',
    name: 'Comic Pop',
    category: 'animated',
    mode: 'word_pop',
    style: {
      fontFamily: 'Impact',
      fontSize: 56,
      fontWeight: 900,
      italic: false,
      uppercase: true,
      textColor: '#FFD700',
      highlightColor: '#FF3366',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.6,
      backgroundPadding: 12,
      backgroundRadius: 8,
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 6,
      shadowEnabled: true,
      shadowColor: '#000000',
      shadowBlur: 0,
      shadowOffsetX: 5,
      shadowOffsetY: 5,
      letterSpacing: 1.0,
      lineHeight: 1.1,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 78.0,
      animationType: 'pop',
      animationIntensity: 1.25,
    },
    isCustom: false,
  },
  {
    id: 'preset_typewriter',
    name: 'Typewriter',
    category: 'minimal',
    mode: 'classic',
    style: {
      fontFamily: 'Courier New',
      fontSize: 38,
      fontWeight: 600,
      italic: false,
      uppercase: false,
      textColor: '#E2E8F0',
      highlightColor: '#E2E8F0',
      backgroundEnabled: true,
      backgroundColor: '#0F172A',
      backgroundOpacity: 0.85,
      backgroundPadding: 14,
      backgroundRadius: 6,
      strokeEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 0,
      shadowEnabled: false,
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      letterSpacing: 1.0,
      lineHeight: 1.3,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 85.0,
      animationType: 'typewriter',
      animationIntensity: 1.0,
    },
    isCustom: false,
  },
  {
    id: 'preset_gradient_modern',
    name: 'Gradient Modern',
    category: 'animated',
    mode: 'karaoke',
    style: {
      fontFamily: 'Inter',
      fontSize: 50,
      fontWeight: 900,
      italic: false,
      uppercase: true,
      textColor: '#FFFFFF',
      highlightColor: '#FF007A',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.6,
      backgroundPadding: 12,
      backgroundRadius: 8,
      strokeEnabled: true,
      strokeColor: '#1A1A2E',
      strokeWidth: 4,
      shadowEnabled: true,
      shadowColor: 'rgba(255, 0, 122, 0.6)',
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      letterSpacing: 1.0,
      lineHeight: 1.15,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 80.0,
      animationType: 'smooth_zoom',
      animationIntensity: 1.1,
    },
    isCustom: false,
  },
  {
    id: 'preset_highlight_box',
    name: 'Highlight Box',
    category: 'karaoke',
    mode: 'karaoke',
    style: {
      fontFamily: 'Inter',
      fontSize: 44,
      fontWeight: 800,
      italic: false,
      uppercase: true,
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      backgroundEnabled: true,
      backgroundColor: '#4F46E5',
      backgroundOpacity: 0.9,
      backgroundPadding: 12,
      backgroundRadius: 8,
      strokeEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 0,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.5)',
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      letterSpacing: 0.5,
      lineHeight: 1.2,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 82.0,
      animationType: 'word_pulse',
      animationIntensity: 1.1,
    },
    isCustom: false,
  },
  {
    id: 'preset_documentary_pro',
    name: 'Documentary Pro',
    category: 'cinematic',
    mode: 'classic',
    style: {
      fontFamily: 'Inter',
      fontSize: 36,
      fontWeight: 500,
      italic: false,
      uppercase: false,
      textColor: '#F1F5F9',
      highlightColor: '#F1F5F9',
      backgroundEnabled: true,
      backgroundColor: '#000000',
      backgroundOpacity: 0.7,
      backgroundPadding: 14,
      backgroundRadius: 4,
      strokeEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 0,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.5)',
      shadowBlur: 4,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      letterSpacing: 0.5,
      lineHeight: 1.3,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 88.0,
      animationType: 'fade_in',
      animationIntensity: 1.0,
    },
    isCustom: false,
  },
  {
    id: 'preset_black_yellow',
    name: 'Black and Yellow',
    category: 'youtube',
    mode: 'word_pop',
    style: {
      fontFamily: 'Impact',
      fontSize: 52,
      fontWeight: 900,
      italic: false,
      uppercase: true,
      textColor: '#FACC15',
      highlightColor: '#FFFFFF',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.8,
      backgroundPadding: 12,
      backgroundRadius: 8,
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 6,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.9)',
      shadowBlur: 6,
      shadowOffsetX: 3,
      shadowOffsetY: 4,
      letterSpacing: 1.0,
      lineHeight: 1.15,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 80.0,
      animationType: 'scale_up',
      animationIntensity: 1.2,
    },
    isCustom: false,
  },
  {
    id: 'preset_white_on_black',
    name: 'White on Black',
    category: 'classic',
    mode: 'classic',
    style: {
      fontFamily: 'Inter',
      fontSize: 42,
      fontWeight: 700,
      italic: false,
      uppercase: false,
      textColor: '#FFFFFF',
      highlightColor: '#FFFFFF',
      backgroundEnabled: true,
      backgroundColor: '#000000',
      backgroundOpacity: 0.85,
      backgroundPadding: 14,
      backgroundRadius: 8,
      strokeEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 0,
      shadowEnabled: false,
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      letterSpacing: 0,
      lineHeight: 1.25,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 85.0,
      animationType: 'none',
      animationIntensity: 1.0,
    },
    isCustom: false,
  },
  {
    id: 'preset_dynamic_word_pop',
    name: 'Dynamic Word Pop',
    category: 'animated',
    mode: 'word_pop',
    style: {
      fontFamily: 'Impact',
      fontSize: 60,
      fontWeight: 900,
      italic: false,
      uppercase: true,
      textColor: '#FFFFFF',
      highlightColor: '#38BDF8',
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.7,
      backgroundPadding: 12,
      backgroundRadius: 8,
      strokeEnabled: true,
      strokeColor: '#0F172A',
      strokeWidth: 6,
      shadowEnabled: true,
      shadowColor: 'rgba(0, 0, 0, 0.85)',
      shadowBlur: 10,
      shadowOffsetX: 2,
      shadowOffsetY: 4,
      letterSpacing: 1.0,
      lineHeight: 1.1,
      textAlign: 'center',
      positionX: 50.0,
      positionY: 75.0,
      animationType: 'word_pulse',
      animationIntensity: 1.25,
    },
    isCustom: false,
  },
];
