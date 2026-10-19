import { AbsoluteFill, useVideoConfig, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Problem } from "./scenes/Problem";
import { Agitation } from "./scenes/Agitation";
import { Solution } from "./scenes/Solution";
import { Features } from "./scenes/Features";
import { Benefits } from "./scenes/Benefits";
import { CTA } from "./scenes/CTA";
import "./design";
// 3720 - 5*24 = 3600 frames at 60 fps; scene origins: 0,480,900,1500,2520,3120.
export const ProductExplainer = ({ audio = true }: { audio?: boolean }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="01 — The problem"
          durationInFrames={8.4 * fps}
          premountFor={fps}
        >
          <Problem />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 0.4 * fps })}
        />
        <TransitionSeries.Sequence
          name="02 — The loose ends"
          durationInFrames={7.4 * fps}
          premountFor={fps}
        >
          <Agitation />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 0.4 * fps })}
        />
        <TransitionSeries.Sequence
          name="03 — Meet IARS"
          durationInFrames={10.4 * fps}
          premountFor={fps}
        >
          <Solution />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 0.4 * fps })}
        />
        <TransitionSeries.Sequence
          name="04 — Real workflows"
          durationInFrames={17.4 * fps}
          premountFor={fps}
        >
          <Features />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={linearTiming({ durationInFrames: 0.4 * fps })}
        />
        <TransitionSeries.Sequence
          name="05 — Clarity for every role"
          durationInFrames={10.4 * fps}
          premountFor={fps}
        >
          <Benefits />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 0.4 * fps })}
        />
        <TransitionSeries.Sequence
          name="06 — Bring it together"
          durationInFrames={8 * fps}
          premountFor={fps}
        >
          <CTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      {audio && (
        <Audio src={staticFile("audio/soundtrack.wav")} premountFor={fps} />
      )}
    </AbsoluteFill>
  );
};
