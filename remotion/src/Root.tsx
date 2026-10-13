import React from 'react';
import { Composition } from 'remotion';
import { AutoVideoComposition } from './compositions/AutoVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AutoVideo"
        component={AutoVideoComposition}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          scenes: [],
          audioUrl: undefined,
          audioStartFrame: 0,
        }}
      />
    </>
  );
};
