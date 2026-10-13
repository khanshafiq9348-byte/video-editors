import React from 'react';
import { Sequence, Audio } from 'remotion';
import { KenBurns } from '../components/AnimatedImage';
import { TransitionOverlay } from '../components/Transitions';

export interface SceneData {
  id: string;
  imageAssetId: string;
  imageUrl?: string;
  sentenceId?: string;
  startFrame: number;
  durationFrames: number;
  effect: {
    type: string;
    intensity: number;
    startScale?: number;
    endScale?: number;
    startX?: number;
    endX?: number;
    startY?: number;
    endY?: number;
  };
  transitionOut?: {
    type: string;
    durationFrames: number;
  } | null;
  fitMode?: 'fill' | 'fit' | 'blur_background';
  colorTone?: 'original' | 'warm' | 'cool' | 'cinematic';
}

import { CaptionsOverlay } from '../components/CaptionsOverlay';
import { TimelineCaptions } from '../../types/captions';

export interface AutoVideoCompositionProps {
  scenes: SceneData[];
  audioUrl?: string;
  audioStartFrame?: number;
  captions?: TimelineCaptions | null;
}

export const AutoVideoComposition: React.FC<AutoVideoCompositionProps> = ({
  scenes = [],
  audioUrl,
  audioStartFrame = 0,
  captions,
}) => {
  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#000',
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      {/* Audio Track */}
      {audioUrl && (
        <Sequence from={audioStartFrame}>
          <Audio src={audioUrl} />
        </Sequence>
      )}

      {/* Visual Scenes */}
      {scenes.map((scene, idx) => {
        const { id, imageUrl, startFrame, durationFrames, effect, transitionOut, fitMode, colorTone } = scene;
        const nextScene = scenes[idx + 1];
        return (
          <Sequence
            key={id}
            from={startFrame}
            durationInFrames={durationFrames}
            name={`Scene-${id}`}
          >
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <KenBurns
                src={imageUrl || ''}
                durationFrames={durationFrames}
                effectType={effect?.type}
                intensity={effect?.intensity}
                startScale={effect?.startScale}
                endScale={effect?.endScale}
                startX={effect?.startX}
                endX={effect?.endX}
                startY={effect?.startY}
                endY={effect?.endY}
                fitMode={fitMode}
                colorTone={colorTone}
              />
              {transitionOut && (
                <TransitionOverlay
                  type={transitionOut.type}
                  durationFrames={transitionOut.durationFrames}
                  totalSceneFrames={durationFrames}
                  nextImageUrl={nextScene?.imageUrl}
                  nextScene={nextScene}
                />
              )}
            </div>
          </Sequence>
        );
      })}

      {/* Captions Overlay */}
      {captions && <CaptionsOverlay captions={captions} />}
    </div>
  );
};
