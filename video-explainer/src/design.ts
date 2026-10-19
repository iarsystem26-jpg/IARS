import { loadFont } from "@remotion/fonts";
import {
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
// Existing choreography is authored on a 30-frame-per-second time base.
// Fractional frames preserve seconds and evaluate new positions at 60 fps.
export const useMotionFrame = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (frame * 30) / fps;
};
export const C = {
  navy: "#002859",
  ink: "#111827",
  blue: "#0081C8",
  gold: "#FFD700",
  orange: "#FF8C00",
  green: "#00A859",
  muted: "#64748B",
  pale: "#F1F5F9",
  border: "#E2E8F0",
  white: "#FFFFFF",
};
export const display = "Outfit, sans-serif";
export const body = "Nunito, sans-serif";
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const progress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], { ...clamp, easing: ease });
export const enter = (frame: number, delay = 0, fps = 30) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 24, stiffness: 130, mass: 0.9 },
  });
void Promise.all([
  loadFont({
    family: "Outfit",
    url: staticFile("assets/Outfit.ttf"),
    weight: "100 900",
  }),
  loadFont({
    family: "Nunito",
    url: staticFile("assets/Nunito.ttf"),
    weight: "200 1000",
  }),
]);
