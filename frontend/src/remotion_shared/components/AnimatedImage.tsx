import React from 'react';
import { interpolate, useCurrentFrame, Easing } from 'remotion';

export interface KenBurnsProps {
  src: string;
  durationFrames: number;
  effectType?: string;
  intensity?: number;
  startScale?: number;
  endScale?: number;
  startX?: number;
  endX?: number;
  startY?: number;
  endY?: number;
  fitMode?: 'fill' | 'fit' | 'blur_background';
  colorTone?: 'original' | 'warm' | 'cool' | 'cinematic';
}

export const KenBurns: React.FC<KenBurnsProps> = ({
  src,
  durationFrames,
  effectType,
  intensity = 0.15,
  startScale,
  endScale,
  startX,
  endX,
  startY,
  endY,
  fitMode = 'fill',
  colorTone = 'original',
}) => {
  const frame = useCurrentFrame();

  // Compute distinct motion parameters based on effectType if not explicitly customized
  const shift = Math.round((intensity || 0.15) * 420); // ~63px
  let actualStartScale = startScale;
  let actualEndScale = endScale;
  let actualStartX = startX;
  let actualEndX = endX;
  let actualStartY = startY;
  let actualEndY = endY;

  const type = (effectType || '').trim().toLowerCase();
  const hasCustomCoords = (startX !== undefined && startX !== 0) ||
                          (endX !== undefined && endX !== 0) ||
                          (startY !== undefined && startY !== 0) ||
                          (endY !== undefined && endY !== 0) ||
                          (startScale !== undefined && endScale !== undefined && !(startScale === 1.0 && endScale === 1.15));

  if (!hasCustomCoords && type) {
    if (type === 'pan_left') {
      actualStartScale = 1.10;
      actualEndScale = 1.10;
      actualStartX = shift;
      actualEndX = -shift;
      actualStartY = 0;
      actualEndY = 0;
    } else if (type === 'pan_right') {
      actualStartScale = 1.10;
      actualEndScale = 1.10;
      actualStartX = -shift;
      actualEndX = shift;
      actualStartY = 0;
      actualEndY = 0;
    } else if (type === 'zoom_out') {
      actualStartScale = 1.18;
      actualEndScale = 1.0;
      actualStartX = 0;
      actualEndX = 0;
      actualStartY = 0;
      actualEndY = 0;
    } else if (type === 'pan_up') {
      actualStartScale = 1.10;
      actualEndScale = 1.10;
      actualStartX = 0;
      actualEndX = 0;
      actualStartY = Math.round(shift * 0.8);
      actualEndY = -Math.round(shift * 0.8);
    } else if (type === 'pan_down') {
      actualStartScale = 1.10;
      actualEndScale = 1.10;
      actualStartX = 0;
      actualEndX = 0;
      actualStartY = -Math.round(shift * 0.8);
      actualEndY = Math.round(shift * 0.8);
    } else if (type === 'zoom_pan') {
      actualStartScale = 1.0;
      actualEndScale = 1.15;
      actualStartX = -Math.round(shift * 0.6);
      actualEndX = Math.round(shift * 0.6);
      actualStartY = 0;
      actualEndY = -Math.round(shift * 0.3);
    } else if (type === 'static') {
      actualStartScale = 1.0;
      actualEndScale = 1.0;
      actualStartX = 0;
      actualEndX = 0;
      actualStartY = 0;
      actualEndY = 0;
    } else { // zoom_in
      actualStartScale = 1.0;
      actualEndScale = 1.15;
      actualStartX = 0;
      actualEndX = 0;
      actualStartY = 0;
      actualEndY = 0;
    }
  } else {
    if (actualStartScale === undefined) actualStartScale = 1.0;
    if (actualEndScale === undefined) actualEndScale = 1.15;
    if (actualStartX === undefined) actualStartX = 0;
    if (actualEndX === undefined) actualEndX = 0;
    if (actualStartY === undefined) actualStartY = 0;
    if (actualEndY === undefined) actualEndY = 0;
  }

  // Ultra-smooth sine ease-in-out for cinema-grade continuous camera motion
  const progress = interpolate(frame, [0, Math.max(1, durationFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.ease),
  });

  const scale = actualStartScale + (actualEndScale - actualStartScale) * progress;
  const translateX = actualStartX + (actualEndX - actualStartX) * progress;
  const translateY = actualStartY + (actualEndY - actualStartY) * progress;

  // Optional Color grading filter (default strictly 'original' = none)
  let filterStyle = 'none';
  if (colorTone === 'warm') {
    filterStyle = 'sepia(0.18) saturate(1.15)';
  } else if (colorTone === 'cool') {
    filterStyle = 'hue-rotate(185deg) saturate(1.05)';
  } else if (colorTone === 'cinematic') {
    filterStyle = 'contrast(1.1) saturate(1.1)';
  }

  const isVideo = Boolean(src && /\.(mp4|mov|webm|mkv|avi|m4v)(\?.*)?$/i.test(src));

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Blur Background Layer for Portrait & Mismatched Aspect Ratios */}
      {fitMode === 'blur_background' && src && (
        <div
          style={{
            position: 'absolute',
            inset: -20,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {isVideo ? (
            <video
              src={src}
              autoPlay
              loop
              muted
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: `blur(24px) brightness(0.65) ${filterStyle !== 'none' ? filterStyle : ''}`,
                transform: 'scale(1.2)',
              }}
            />
          ) : (
            <img
              src={src}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: `blur(24px) brightness(0.65) ${filterStyle !== 'none' ? filterStyle : ''}`,
                transform: 'scale(1.2)',
              }}
            />
          )}
        </div>
      )}

      {/* Main Foreground Animated Visual (Image or Video) */}
      {isVideo ? (
        <video
          src={src}
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: fitMode === 'fit' ? 'contain' : (fitMode === 'blur_background' ? 'contain' : 'cover'),
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            transformOrigin: 'center center',
            display: 'block',
            position: 'relative',
            zIndex: 1,
            filter: filterStyle,
          }}
        />
      ) : (
        <img
          src={src}
          alt="Scene"
          style={{
            width: '100%',
            height: '100%',
            objectFit: fitMode === 'fit' ? 'contain' : (fitMode === 'blur_background' ? 'contain' : 'cover'),
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            transformOrigin: 'center center',
            display: 'block',
            position: 'relative',
            zIndex: 1,
            filter: filterStyle,
          }}
        />
      )}
    </div>
  );
};
