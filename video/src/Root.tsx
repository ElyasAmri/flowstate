import {Composition} from 'remotion';
import {Flowstate} from './Flowstate';
import {Sample} from './Sample';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Flowstate"
        component={Flowstate}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'Flowstate',
          subtitle:
            'Codify bureaucratic procedures as deterministic, human-in-the-loop workflows.',
        }}
      />
      <Composition
        id="Sample"
        component={Sample}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'Flowstate',
          subtitle:
            'Codify bureaucratic procedures as deterministic, human-in-the-loop workflows.',
        }}
      />
    </>
  );
};
