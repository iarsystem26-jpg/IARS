import { AbsoluteFill, interpolate } from "remotion";
import {
  Backdrop,
  Kinetic,
  Reveal,
  Seal,
  DemoNote,
} from "../components/Motion";
import { AppShell, Dashboard, Audience } from "../components/ProductUI";
import { C, body, display, clamp, ease, useMotionFrame } from "../design";

export const Solution = () => {
  const f = useMotionFrame();
  const focus = interpolate(f, [104, 156], [0, 1], { ...clamp, easing: ease });
  const appear = interpolate(f, [38, 84], [0, 1], { ...clamp, easing: ease });
  const scale = 0.72 + focus * 0.26;
  return (
    <AbsoluteFill style={{ fontFamily: body, color: "white" }}>
      <Backdrop />
      <Reveal
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 70,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <Seal size={76} />
        <div
          style={{
            fontFamily: display,
            fontSize: 89,
            fontWeight: 650,
            letterSpacing: -3,
          }}
        >
          IARS
        </div>
        <div
          style={{
            width: 1,
            height: 58,
            background: "#FFFFFF30",
            margin: "0 12px",
          }}
        />
        <div style={{ fontSize: 27, color: "#C1D9EA", lineHeight: 1.3 }}>
          Institution Attendance
          <br />
          and Records System
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 219,
          textAlign: "center",
          opacity: 1 - focus,
          translate: `0 ${-focus * 65}px`,
        }}
      >
        <Kinetic delay={7} size={94}>
          School attendance.
        </Kinetic>
        <Kinetic delay={20} size={94} color={C.gold}>
          Brought together.
        </Kinetic>
      </div>
      <div
        style={{
          position: "absolute",
          left: 960 - 620 * scale,
          top: 480 - focus * 254,
          opacity: appear,
          scale,
          transformOrigin: "left top",
          translate: `0 ${(1 - appear) * 170}px`,
          transform: `perspective(2200px) rotateX(${(1 - appear) * 13}deg) rotateY(${(1 - focus) * -5}deg)`,
          filter: `drop-shadow(0 0 ${20 + focus * 15}px #0081C840)`,
        }}
      >
        <AppShell height={640}>
          <Dashboard />
        </AppShell>
      </div>
      <Reveal
        delay={176}
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 892,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Audience />
      </Reveal>
      <DemoNote />
    </AbsoluteFill>
  );
};
