import React from 'react';
import { interpolate, useCurrentFrame, Easing } from 'remotion';

export interface KenBurnsProps {
  src: string;
  durationFrames: number;
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
  startScale = 1.0,
  endScale = 1.15,
  startX = 0,
  endX = 0,
  startY = 0,
  endY = 0,
  fitMode = 'fill',
  colorTone = 'original',
}) => {
  const frame = useCurrentFrame();

  // Ultra-smooth sine ease-in-out for cinema-grade continuous camera motion
  const progress = interpolate(frame, [0, Math.max(1, durationFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.ease),
  });

  const scale = startScale + (endScale - startScale) * progress;
  const translateX = startX + (endX - startX) * progress;
  const translateY = startY + (endY - startY) * progress;

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
