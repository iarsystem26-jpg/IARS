import { Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { AdProblem } from "./Problem";
import { AdSolution } from "./Solution";
import { AdClosing } from "./Closing";

export const Advertisement = ({ audio = true }: { audio?: boolean }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      <Sequence
        name="01 · The manual routine"
        durationInFrames={4 * fps}
        premountFor={fps}
      >
        <AdProblem />
      </Sequence>
      <Sequence
        name="02 · Scan, verify, record"
        from={4 * fps}
        durationInFrames={7 * fps}
        premountFor={fps}
      >
        <AdSolution />
      </Sequence>
      <Sequence
        name="03 · Log in to IARS"
        from={11 * fps}
        durationInFrames={4 * fps}
        premountFor={fps}
      >
        <AdClosing />
      </Sequence>
      {audio && (
        <Audio
          name="Emma · narration"
          src={staticFile("advertisement/narration.wav")}
          premountFor={fps}
        />
      )}
      {audio && (
        <Audio
          name="Original electronic score"
          src={staticFile("advertisement/music.wav")}
          premountFor={fps}
        />
      )}
      {audio && (
        <Audio
          name="Synchronized effects"
          src={staticFile("advertisement/effects.wav")}
          premountFor={fps}
        />
      )}
    </>
  );
};
