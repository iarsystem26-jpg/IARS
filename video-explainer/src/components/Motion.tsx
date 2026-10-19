import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import {
  C,
  body,
  display,
  enter,
  clamp,
  ease,
  useMotionFrame,
} from "../design";
export const Backdrop: React.FC<{ light?: boolean }> = ({ light = false }) => {
  const frame = useMotionFrame();
  return (
    <AbsoluteFill
      style={{
        background: light ? "#F6F9FD" : C.navy,
        color: light ? C.navy : C.white,
        fontFamily: body,
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          background: light
            ? "radial-gradient(ellipse at 80% 25%, #DCEFFA 0%, transparent 62%)"
            : "radial-gradient(ellipse at 74% 40%, #004D83 0%, transparent 63%)",
          opacity: 0.85,
        }}
      />
      {!light && (
        <>
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(90deg, transparent 49.8%, #55BFFF09 50%, transparent 50.2%), linear-gradient(transparent 49.8%, #55BFFF09 50%, transparent 50.2%)",
              backgroundSize: "140px 140px",
              opacity: 0.55,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 600 + Math.sin(frame / 150) * 90,
              top: -320,
              width: 720,
              height: 1300,
              background:
                "radial-gradient(ellipse, #00A8FF33, transparent 67%)",
              rotate: "-19deg",
              filter: "blur(25px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 335,
              top: 510,
              width: 1250,
              height: 1250,
              borderRadius: "50%",
              border: "2px solid #39BFFF45",
              boxShadow: "0 -12px 50px #0081C838, inset 0 16px 60px #0081C825",
              translate: `0 ${interpolate(frame, [0, 240], [55, 0], clamp)}px`,
            }}
          />
        </>
      )}
      {light && (
        <div
          style={{
            position: "absolute",
            width: 760,
            height: 760,
            border: "100px solid #0081C80B",
            borderRadius: "50%",
            right: -210,
            bottom: -430,
            boxSizing: "border-box",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          width: 1000,
          height: 1000,
          borderRadius: "50%",
          border: `1px solid ${light ? "#0081C814" : "#FFFFFF09"}`,
          right: -180,
          top: -210,
          translate: `${interpolate(frame, [0, 300], [0, -25], clamp)}px 0`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1280,
          height: 1280,
          borderRadius: "50%",
          border: `1px solid ${light ? "#0081C811" : "#FFFFFF07"}`,
          right: -320,
          top: -350,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          bottom: 100,
          height: 1,
          background: light ? "#00285915" : "#FFFFFF12",
        }}
      />
    </AbsoluteFill>
  );
};
export const Seal: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <Img
    src={staticFile("assets/academic-seal-transparent.png")}
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      objectFit: "contain",
      background: "transparent",
      border: "2px solid #FFD700",
      padding: 3,
    }}
  />
);
export const Label: React.FC<{
  children: React.ReactNode;
  light?: boolean;
  style?: React.CSSProperties;
}> = ({ children, light = false, style }) => (
  <div
    style={{
      fontFamily: body,
      fontSize: 22,
      fontWeight: 800,
      letterSpacing: 3,
      textTransform: "uppercase",
      color: light ? C.blue : C.gold,
      ...style,
    }}
  >
    {children}
  </div>
);
export const Reveal: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
  distance?: number;
}> = ({ children, delay = 0, style, distance = 40 }) => {
  const frame = useMotionFrame();
  const p = enter(frame, delay);
  return (
    <div
      style={{
        opacity: Math.min(1, p),
        translate: `0 ${(1 - p) * distance}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
export const Kinetic: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, size = 104, color, style }) => {
  const frame = useMotionFrame();
  return (
    <div style={{ overflow: "hidden", paddingBottom: 8, ...style }}>
      <div
        style={{
          fontFamily: display,
          fontWeight: 600,
          fontSize: size,
          letterSpacing: -3.5,
          lineHeight: 1.03,
          color,
          translate: `0 ${interpolate(frame, [delay, delay + 24], [115, 0], { ...clamp, easing: ease })}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
};
export const FloatingPanel: React.FC<{
  children: React.ReactNode;
  x: number;
  y: number;
  width: number;
  delay?: number;
  rotate?: number;
  style?: React.CSSProperties;
}> = ({ children, x, y, width, delay = 0, rotate = 0, style }) => {
  const frame = useMotionFrame();
  const p = enter(frame, delay);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        opacity: Math.min(1, p),
        translate: `${Math.sin((frame - delay) / 80) * 5}px ${(1 - p) * 55 + Math.sin((frame - delay) / 65) * 7}px`,
        rotate: `${rotate + Math.sin((frame - delay) / 110) * 0.55}deg`,
        background: "white",
        border: "1px solid #E2E8F0",
        borderRadius: 24,
        color: C.navy,
        boxShadow: "0 26px 65px #001B3D24",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
type Point = { frame: number; x: number; y: number };
const cubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const Cursor: React.FC<{
  points: Point[];
  clicks?: number[];
  showFrom?: number;
  showUntil?: number;
}> = ({ points, clicks = [], showFrom = 0, showUntil = 9999 }) => {
  const f = useMotionFrame();
  const times = points.map((p) => p.frame);
  const x = interpolate(
    f,
    times,
    points.map((p) => p.x),
    { ...clamp, easing: cubic },
  );
  const y = interpolate(
    f,
    times,
    points.map((p) => p.y),
    { ...clamp, easing: cubic },
  );
  const current = clicks.find((c) => f >= c && f < c + 16);
  const delta = current === undefined ? 0 : f - current;
  const opacity = f < showFrom || f > showUntil ? 0 : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {current !== undefined && (
        <div
          style={{
            position: "absolute",
            left: -22,
            top: -22,
            width: 44,
            height: 44,
            border: `3px solid ${C.orange}`,
            borderRadius: "50%",
            scale: 1 + delta / 8,
            opacity: 1 - delta / 16,
          }}
        />
      )}
      <svg
        width="34"
        height="44"
        viewBox="0 0 34 44"
        style={{
          filter: "drop-shadow(1px 3px 3px #001B3D60)",
          scale: current !== undefined && delta < 5 ? 0.9 : 1,
        }}
      >
        <path
          d="M3 2L3 33L11 26L18 41L25 37L18 23L30 22Z"
          fill="white"
          stroke="#002859"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
export const DemoNote = () => (
  <div
    style={{
      position: "absolute",
      left: 120,
      right: 120,
      bottom: 40,
      lineHeight: "24px",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      color: "#7F9FB8",
      fontSize: 17,
      fontFamily: body,
      letterSpacing: 0.5,
    }}
  >
    Illustrative data · Source-based interface reconstruction
  </div>
);
