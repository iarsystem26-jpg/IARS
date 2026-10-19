import React from "react";
import {
  AbsoluteFill,
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { C, body, display, clamp } from "../design";

export { C, body, display, clamp };
export const move = (f: number, a: number, b: number, x = 0, y = 1) =>
  interpolate(f, [a, b], [x, y], {
    ...clamp,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
export const Seal = ({ size = 70 }: { size?: number }) => (
  <CanvasImage
    src={staticFile("assets/academic-seal-transparent.png")}
    style={{ width: size, height: size, borderRadius: "50%", objectFit: "contain" }}
  />
);
export const Stage: React.FC<{
  children: React.ReactNode;
  light?: boolean;
}> = ({ children, light = false }) => {
  const { width } = useVideoConfig();
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{ overflow: "hidden", background: light ? "#F1F5F9" : C.navy }}
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          position: "absolute",
          transform: `scale(${width / 1920})`,
          transformOrigin: "0 0",
          fontFamily: body,
          color: light ? C.navy : "white",
          background: light
            ? "radial-gradient(ellipse at 80% 55%, #fff 0%, #eff5fc 65%)"
            : "radial-gradient(ellipse at 78% 35%, #075e90 0%, #002859 55%, #001730 100%)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 1100,
            height: 1100,
            border: "1px solid #8FC8EA20",
            borderRadius: "50%",
            right: -180,
            top: -320,
            translate: `${f * 0.025}px 0`,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 1450,
            height: 1450,
            border: "1px solid #8FC8EA15",
            borderRadius: "50%",
            right: -355,
            top: -495,
          }}
        />
        {children}
      </div>
    </AbsoluteFill>
  );
};
export const Wordmark = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
    <Seal size={58} />
    <span
      style={{
        fontFamily: display,
        fontSize: 36,
        fontWeight: 650,
        letterSpacing: 1,
      }}
    >
      IARS
    </span>
  </div>
);
