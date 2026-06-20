import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export type FlowstateProps = {
  title: string;
  subtitle: string;
};

const container: React.CSSProperties = {
  backgroundColor: '#0b0e14',
  justifyContent: 'center',
  alignItems: 'center',
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

export const Flowstate: React.FC<FlowstateProps> = ({title, subtitle}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // Spring-driven scale/fade-in for the title.
  const enter = spring({
    frame,
    fps,
    config: {
      damping: 200,
      mass: 0.6,
    },
  });

  const titleScale = interpolate(enter, [0, 1], [0.85, 1]);
  const titleOpacity = enter;

  // Subtitle fades in slightly after the title.
  const subtitleOpacity = interpolate(frame, [18, 42], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const subtitleShift = interpolate(frame, [18, 42], [16, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={container}>
      <h1
        style={{
          margin: 0,
          color: '#ffffff',
          fontSize: 140,
          fontWeight: 700,
          letterSpacing: -2,
          opacity: titleOpacity,
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
          fontWeight: 400,
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleShift}px)`,
        }}
      >
        {subtitle}
      </p>
    </AbsoluteFill>
  );
};
