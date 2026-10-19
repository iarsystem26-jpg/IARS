import { AbsoluteFill, interpolate } from "remotion";
import {
  Backdrop,
  Kinetic,
  Label,
  Reveal,
  FloatingPanel,
  DemoNote,
} from "../components/Motion";
import { MiniRecord } from "../components/ProductUI";
import { C, body, clamp, useMotionFrame } from "../design";
export const Benefits = () => {
  const f = useMotionFrame();
  return (
    <AbsoluteFill style={{ fontFamily: body, color: C.navy }}>
      <Backdrop light />
      <div style={{ position: "absolute", left: 120, top: 139, width: 860 }}>
        <Label light>Clarity for every role</Label>
        <div style={{ marginTop: 41 }}>
          <Kinetic size={96}>Clearer check-ins.</Kinetic>
          <Kinetic delay={43} size={96}>
            Organized records.
          </Kinetic>
          <Kinetic delay={91} size={96} color={C.blue}>
            Easier follow-up.
          </Kinetic>
        </div>
        <Reveal
          delay={160}
          style={{
            marginTop: 39,
            fontSize: 30,
            color: C.muted,
            lineHeight: 1.5,
            width: 670,
          }}
        >
          Students, officers, and administrators.
          <br />
          Each working within their assigned role.
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          translate: `${interpolate(f, [0, 300], [0, -20], clamp)}px 0`,
        }}
      >
        <FloatingPanel x={1070} y={184} width={590} delay={9} rotate={-3}>
          <MiniRecord kind="record" />
        </FloatingPanel>
        <FloatingPanel x={1160} y={422} width={540} delay={65} rotate={3}>
          <MiniRecord kind="hours" />
        </FloatingPanel>
        <FloatingPanel x={1050} y={669} width={580} delay={113} rotate={-2}>
          <MiniRecord kind="excuse" />
        </FloatingPanel>
      </div>
      <DemoNote />
    </AbsoluteFill>
  );
};
