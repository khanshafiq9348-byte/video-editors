import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import {
  TimelineCaptions,
  CaptionSegment,
  CaptionWord,
  CaptionStyle,
  CaptionMode,
} from '../../types/captions';

interface CaptionsOverlayProps {
  captions?: TimelineCaptions | null;
}

export const CaptionsOverlay: React.FC<CaptionsOverlayProps> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (!captions || !captions.settings || !captions.settings.enabled) {
    return null;
  }

  const { settings, segments } = captions;
  if (!segments || segments.length === 0) {
    return null;
  }

  // Find active segment at current frame
  const activeSegment = segments.find(
    (seg) => frame >= seg.startFrame && frame < seg.endFrame
  );

  if (!activeSegment) {
    return null;
  }

  // Merge global style with segment override if present
  const mergedStyle: CaptionStyle = {
    ...settings.globalStyle,
    ...(activeSegment.styleOverride || {}),
  };

  const mode: CaptionMode = settings.mode || 'karaoke';
  const segStart = activeSegment.startFrame;
  const segEnd = activeSegment.endFrame;
  const segDuration = Math.max(1, segEnd - segStart);
  const frameInSeg = frame - segStart;

  // Compute animation transformations
  let animOpacity = 1;
  let animScale = 1;
  let animTranslateY = 0;

  const animType = mergedStyle.animationType || 'none';
  const intensity = mergedStyle.animationIntensity || 1.0;

  if (animType === 'fade_in') {
    animOpacity = interpolate(frameInSeg, [0, Math.min(8, segDuration)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (animType === 'fade_out') {
    animOpacity = interpolate(
      frameInSeg,
      [Math.max(0, segDuration - 8), segDuration],
      [1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  } else if (animType === 'pop') {
    const spr = spring({
      frame: frameInSeg,
      fps,
      config: { damping: 12, stiffness: 200, mass: 0.6 },
    });
    animScale = 0.5 + 0.5 * spr * intensity;
  } else if (animType === 'scale_up') {
    animScale = interpolate(frameInSeg, [0, segDuration], [0.9, 1.08 * intensity], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (animType === 'slide_up') {
    animTranslateY = interpolate(frameInSeg, [0, Math.min(10, segDuration)], [35 * intensity, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    animOpacity = interpolate(frameInSeg, [0, Math.min(8, segDuration)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (animType === 'slide_down') {
    animTranslateY = interpolate(frameInSeg, [0, Math.min(10, segDuration)], [-35 * intensity, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    animOpacity = interpolate(frameInSeg, [0, Math.min(8, segDuration)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (animType === 'bounce') {
    const spr = spring({
      frame: frameInSeg,
      fps,
      config: { damping: 8, stiffness: 180, mass: 0.8 },
    });
    animScale = 0.4 + 0.6 * spr * intensity;
  } else if (animType === 'smooth_zoom') {
    animScale = interpolate(frameInSeg, [0, segDuration], [1.0, 1.06 * intensity], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  // Active word detection for karaoke & word pop
  const words = activeSegment.words && activeSegment.words.length > 0
    ? activeSegment.words
    : activeSegment.text.split(' ').map((txt, idx, arr) => {
        const wDur = segDuration / Math.max(1, arr.length);
        return {
          id: `fallback_${idx}`,
          text: txt,
          startFrame: Math.round(segStart + idx * wDur),
          endFrame: Math.round(segStart + (idx + 1) * wDur),
        };
      });

  const activeWordIndex = words.findIndex(
    (w) => frame >= w.startFrame && frame < w.endFrame
  );

  // Position coordinates with safe margins
  const posX = Math.max(5, Math.min(95, mergedStyle.positionX ?? 50));
  const posY = Math.max(5, Math.min(95, mergedStyle.positionY ?? 82));

  // Build text shadow / stroke
  const textShadowParts: string[] = [];
  if (mergedStyle.shadowEnabled) {
    textShadowParts.push(
      `${mergedStyle.shadowOffsetX || 0}px ${mergedStyle.shadowOffsetY || 3}px ${mergedStyle.shadowBlur || 6}px ${mergedStyle.shadowColor || 'rgba(0,0,0,0.8)'}`
    );
  }
  if (mergedStyle.strokeEnabled && mergedStyle.strokeWidth > 0) {
    const sw = mergedStyle.strokeWidth;
    const sc = mergedStyle.strokeColor || '#000000';
    // Sharp perimeter shadow for crisp outline rendering across all browsers
    textShadowParts.push(
      `-${sw}px -${sw}px 0 ${sc}`,
      `${sw}px -${sw}px 0 ${sc}`,
      `-${sw}px ${sw}px 0 ${sc}`,
      `${sw}px ${sw}px 0 ${sc}`
    );
  }

  // Responsive font scaling based on video resolution (relative to 1080p height)
  const scaleFactor = height / 1080;
  const responsiveFontSize = Math.max(18, Math.round(mergedStyle.fontSize * scaleFactor));

  // Background styling
  const bgStyle: React.CSSProperties = mergedStyle.backgroundEnabled
    ? {
        backgroundColor: mergedStyle.backgroundColor || '#000000',
        opacity: mergedStyle.backgroundOpacity ?? 0.7,
        padding: `${(mergedStyle.backgroundPadding || 12) * scaleFactor}px ${(mergedStyle.backgroundPadding || 16) * 1.5 * scaleFactor}px`,
        borderRadius: `${(mergedStyle.backgroundRadius || 8) * scaleFactor}px`,
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
      }
    : {};

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${posX}%`,
    top: `${posY}%`,
    transform: `translate(-50%, -50%) translateY(${animTranslateY}px) scale(${animScale})`,
    opacity: animOpacity,
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: mergedStyle.textAlign === 'left' ? 'flex-start' : mergedStyle.textAlign === 'right' ? 'flex-end' : 'center',
    alignItems: 'center',
    columnGap: '0.3em',
    rowGap: '0.15em',
    maxWidth: `${Math.round(width * 0.9)}px`,
    pointerEvents: 'none',
    zIndex: 9999,
    fontFamily: mergedStyle.fontFamily || 'Inter, sans-serif',
    fontSize: `${responsiveFontSize}px`,
    fontWeight: mergedStyle.fontWeight || 700,
    fontStyle: mergedStyle.italic ? 'italic' : 'normal',
    textTransform: mergedStyle.uppercase ? 'uppercase' : 'none',
    letterSpacing: `${(mergedStyle.letterSpacing || 0) * scaleFactor}px`,
    lineHeight: mergedStyle.lineHeight || 1.2,
    textAlign: mergedStyle.textAlign || 'center',
    textShadow: textShadowParts.join(', '),
    WebkitTextStroke: mergedStyle.strokeEnabled
      ? `${(mergedStyle.strokeWidth || 3) * scaleFactor}px ${mergedStyle.strokeColor || '#000000'}`
      : undefined,
    ...bgStyle,
  };

  // Render content according to CaptionMode
  if (mode === 'word_by_word') {
    const singleWord = activeWordIndex !== -1 ? words[activeWordIndex] : words[0];
    if (!singleWord) return null;

    return (
      <div style={containerStyle}>
        <span
          style={{
            color: mergedStyle.highlightColor || mergedStyle.textColor,
            display: 'inline-block',
            transform: 'scale(1.1)',
            transition: 'all 0.1s ease-out',
            whiteSpace: 'nowrap',
          }}
        >
          {singleWord.text}
        </span>
      </div>
    );
  }

  if (mode === 'karaoke' || mode === 'word_pop') {
    return (
      <div style={containerStyle}>
        {words.map((word, wIdx) => {
          const isActive = wIdx === activeWordIndex;
          const isPast = activeWordIndex !== -1 && wIdx < activeWordIndex;

          let wordColor = mergedStyle.textColor;
          let wordScale = 1;
          let wordGlow = '';

          if (isActive) {
            wordColor = mergedStyle.highlightColor || '#FFDE00';
            if (mode === 'word_pop') {
              wordScale = 1.15;
            } else if (animType === 'word_pulse') {
              const wFrame = frame - word.startFrame;
              wordScale = 1.0 + 0.12 * Math.sin((wFrame / Math.max(1, word.endFrame - word.startFrame)) * Math.PI);
            }
            if (animType === 'word_highlight') {
              wordGlow = `0 0 16px ${mergedStyle.highlightColor || '#FFDE00'}`;
            }
          } else if (isPast) {
            // Already spoken words in karaoke: full brightness
            wordColor = mergedStyle.textColor;
          } else {
            // Upcoming words in karaoke: subtle dimming (0.8)
            wordColor = mergedStyle.textColor;
          }

          return (
            <span
              key={word.id || wIdx}
              style={{
                color: wordColor,
                display: 'inline-block',
                whiteSpace: 'nowrap',
                transform: `scale(${wordScale})`,
                textShadow: wordGlow ? `${wordGlow}, ${textShadowParts.join(', ')}` : undefined,
                transition: 'color 0.08s ease, transform 0.08s ease',
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    );
  }

  // Typewriter Mode: Reveal words up to current active word or time progress
  if (animType === 'typewriter') {
    const wordsToShowCount = activeWordIndex !== -1
      ? activeWordIndex + 1
      : Math.min(words.length, Math.ceil((frameInSeg / segDuration) * words.length));

    return (
      <div style={containerStyle}>
        {words.slice(0, wordsToShowCount).map((word, wIdx) => (
          <span
            key={word.id || wIdx}
            style={{
              color: mergedStyle.textColor,
              display: 'inline-block',
              whiteSpace: 'nowrap',
            }}
          >
            {word.text}
          </span>
        ))}
      </div>
    );
  }

  // Classic Subtitles & Phrase-by-Phrase Mode
  return (
    <div style={containerStyle}>
      <span style={{ color: mergedStyle.textColor }}>
        {activeSegment.text}
      </span>
    </div>
  );
};
