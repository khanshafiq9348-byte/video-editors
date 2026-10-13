import React from 'react';
import { interpolate, useCurrentFrame, Easing } from 'remotion';

export interface TransitionOverlayProps {
  type: string; // 'crossfade' | 'fade' | 'slide_left' | 'slide_right' | 'zoom' | 'cut' | 'automatic'
  durationFrames: number;
  totalSceneFrames: number;
  nextImageUrl?: string;
  nextScene?: any;
}

/** Helper to render the next scene image with matching color tone, fit mode, and start position */
function renderNextSceneImage(nextImageUrl: string, nextScene?: any) {
  const nextStartScale = nextScene?.effect?.startScale ?? 1.0;
  const nextStartX = nextScene?.effect?.startX ?? 0;
  const nextStartY = nextScene?.effect?.startY ?? 0;
  const fitMode = nextScene?.fitMode ?? 'fill';
  const colorTone = nextScene?.colorTone ?? 'original';

  let filterStyle = 'none';
  if (colorTone === 'warm') filterStyle = 'sepia(0.18) saturate(1.15)';
  else if (colorTone === 'cool') filterStyle = 'hue-rotate(185deg) saturate(1.05)';
  else if (colorTone === 'cinematic') filterStyle = 'contrast(1.1) saturate(1.1)';

  return (
    <>
      {fitMode === 'blur_background' && (
        <div
          style={{
            position: 'absolute',
            inset: -20,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <img
            src={nextImageUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: `blur(24px) brightness(0.65) ${filterStyle !== 'none' ? filterStyle : ''}`,
              transform: 'scale(1.2)',
            }}
          />
        </div>
      )}
      <img
        src={nextImageUrl}
        alt="transition target"
        style={{
          width: '100%',
          height: '100%',
          objectFit: fitMode === 'fit' ? 'contain' : (fitMode === 'blur_background' ? 'contain' : 'cover'),
          transform: `translate(${nextStartX}px, ${nextStartY}px) scale(${nextStartScale})`,
          transformOrigin: 'center center',
          filter: filterStyle !== 'none' ? filterStyle : undefined,
          display: 'block',
          position: 'relative',
        }}
      />
    </>
  );
}

export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({
  type,
  durationFrames,
  totalSceneFrames,
  nextImageUrl,
  nextScene,
}) => {
  const frame = useCurrentFrame();

  if (!type || type === 'cut' || durationFrames <= 0) {
    return null;
  }

  // Active during the last `durationFrames` of the scene
  const transitionStart = Math.max(0, totalSceneFrames - durationFrames);
  if (frame < transitionStart) {
    return null;
  }

  // Ultra-smooth bezier curve for cinema grade feel
  const progress = interpolate(
    frame,
    [transitionStart, Math.max(transitionStart + 1, totalSceneFrames - 1)],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.4, 0.0, 0.2, 1.0),
    }
  );

  // Clean, professional crossfade dissolve
  if (type === 'crossfade' || type === 'automatic' || type === 'auto') {
    if (nextImageUrl) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: progress,
            pointerEvents: 'none',
            overflow: 'hidden',
            backgroundColor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {renderNextSceneImage(nextImageUrl, nextScene)}
        </div>
      );
    }
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#000',
          opacity: progress * 0.5,
          pointerEvents: 'none',
        }}
      />
    );
  }

  // Smooth Dip to Black
  if (type === 'fade') {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#000',
          opacity: progress,
          pointerEvents: 'none',
        }}
      />
    );
  }

  // Cinema Grade Slide Left
  if (type === 'slide_left' && nextImageUrl) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateX(${(1 - progress) * 100}%)`,
          pointerEvents: 'none',
          overflow: 'hidden',
          backgroundColor: '#000',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {renderNextSceneImage(nextImageUrl, nextScene)}
      </div>
    );
  }

  // Cinema Grade Slide Right
  if (type === 'slide_right' && nextImageUrl) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateX(${-(1 - progress) * 100}%)`,
          pointerEvents: 'none',
          overflow: 'hidden',
          backgroundColor: '#000',
          boxShadow: '8px 0 24px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {renderNextSceneImage(nextImageUrl, nextScene)}
      </div>
    );
  }

  // Cinematic Zoom In/Out transition
  if ((type === 'zoom' || type === 'zoom_in' || type === 'zoom_out') && nextImageUrl) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: progress,
          transform: `scale(${0.92 + 0.08 * progress})`,
          pointerEvents: 'none',
          overflow: 'hidden',
          backgroundColor: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {renderNextSceneImage(nextImageUrl, nextScene)}
      </div>
    );
  }

  return null;
};
