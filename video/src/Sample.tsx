import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// A self-contained 30s (900-frame @ 30fps) sample video for Flowstate.
// Four sequenced scenes: title -> problem -> the 4 node kinds -> closing.
// Colors follow the channel model (green = ui, purple = flow, yellow =
// service, dark gray = agent, light gray = action/decision).

export type SampleProps = {
  title: string;
  subtitle: string;
};

const BG = '#0b0e14';
const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const fill: React.CSSProperties = {
  backgroundColor: BG,
  justifyContent: 'center',
  alignItems: 'center',
  fontFamily: FONT,
};

/** Fade + rise in over [from, from+dur], hold, then fade out near the end. */
function useReveal(from: number, dur = 18) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [from, from + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const shift = interpolate(frame, [from, from + dur], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return {opacity, transform: `translateY(${shift}px)`};
}

// --- Scene 1: title -------------------------------------------------------
const TitleScene: React.FC<SampleProps> = ({title, subtitle}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 200, mass: 0.6}});
  const titleScale = interpolate(enter, [0, 1], [0.85, 1]);
  const sub = useReveal(18, 24);
  return (
    <AbsoluteFill style={fill}>
      <h1
        style={{
          margin: 0,
          color: '#ffffff',
          fontSize: 150,
          fontWeight: 700,
          letterSpacing: -2,
          opacity: enter,
          transform: `scale(${titleScale})`,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          marginTop: 28,
          maxWidth: 1200,
          textAlign: 'center',
          color: '#9aa4b2',
          fontSize: 40,
          lineHeight: 1.35,
          ...sub,
        }}
      >
        {subtitle}
      </p>
    </AbsoluteFill>
  );
};

// --- Scene 2: the problem / value prop ------------------------------------
const ProblemScene: React.FC = () => {
  const a = useReveal(4);
  const b = useReveal(22);
  return (
    <AbsoluteFill style={{...fill, padding: 160}}>
      <h2
        style={{
          margin: 0,
          color: '#ffffff',
          fontSize: 84,
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: -1,
          ...a,
        }}
      >
        Most cases are routine.
      </h2>
      <p
        style={{
          marginTop: 32,
          maxWidth: 1300,
          textAlign: 'center',
          color: '#9aa4b2',
          fontSize: 46,
          lineHeight: 1.4,
          ...b,
        }}
      >
        Automate them deterministically, then escalate only the genuine
        exceptions to a human.
      </p>
    </AbsoluteFill>
  );
};

// --- Scene 3: the 4 node kinds --------------------------------------------
type Kind = {label: string; meaning: string; color: string; text: string};
const KINDS: Kind[] = [
  {label: 'Channel', meaning: 'crosses a boundary', color: '#2ecc71', text: '#06210f'},
  {label: 'Agent', meaning: 'an AI does the work', color: '#3a3f4b', text: '#e6eaf0'},
  {label: 'Action', meaning: 'deterministic logic', color: '#c7cdd6', text: '#10141c'},
  {label: 'Decision', meaning: 'guarded branch', color: '#c7cdd6', text: '#10141c'},
];

const NodeCard: React.FC<{kind: Kind; index: number}> = ({kind, index}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({
    frame: frame - 6 - index * 8,
    fps,
    config: {damping: 200, mass: 0.7},
  });
  return (
    <div
      style={{
        width: 340,
        height: 360,
        margin: 18,
        borderRadius: 28,
        backgroundColor: kind.color,
        color: kind.text,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 28,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px)`,
        boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{fontSize: 52, fontWeight: 700, letterSpacing: -1}}>
        {kind.label}
      </div>
      <div style={{marginTop: 16, fontSize: 30, opacity: 0.8, textAlign: 'center'}}>
        {kind.meaning}
      </div>
    </div>
  );
};

const NodesScene: React.FC = () => {
  const heading = useReveal(2);
  return (
    <AbsoluteFill style={{...fill, flexDirection: 'column'}}>
      <h2
        style={{
          margin: 0,
          marginBottom: 40,
          color: '#ffffff',
          fontSize: 72,
          fontWeight: 700,
          letterSpacing: -1,
          ...heading,
        }}
      >
        Four node kinds. One boundary rule.
      </h2>
      <div style={{display: 'flex', flexDirection: 'row'}}>
        {KINDS.map((k, i) => (
          <NodeCard key={k.label} kind={k} index={i} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

// --- Scene 4: closing -----------------------------------------------------
const ClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 200, mass: 0.6}});
  const tag = useReveal(20, 22);
  return (
    <AbsoluteFill style={fill}>
      <h1
        style={{
          margin: 0,
          color: '#ffffff',
          fontSize: 130,
          fontWeight: 700,
          letterSpacing: -2,
          opacity: enter,
          transform: `scale(${interpolate(enter, [0, 1], [0.9, 1])})`,
        }}
      >
        Flowstate
      </h1>
      <p style={{marginTop: 24, color: '#9aa4b2', fontSize: 42, ...tag}}>
        Auditable. Replayable. Human-in-the-loop.
      </p>
    </AbsoluteFill>
  );
};

// --- Composition: 30s = 900 frames @ 30fps --------------------------------
export const Sample: React.FC<SampleProps> = ({title, subtitle}) => {
  return (
    <AbsoluteFill style={{backgroundColor: BG}}>
      <Sequence durationInFrames={210}>
        <TitleScene title={title} subtitle={subtitle} />
      </Sequence>
      <Sequence from={210} durationInFrames={210}>
        <ProblemScene />
      </Sequence>
      <Sequence from={420} durationInFrames={270}>
        <NodesScene />
      </Sequence>
      <Sequence from={690} durationInFrames={210}>
        <ClosingScene />
      </Sequence>
    </AbsoluteFill>
  );
};
