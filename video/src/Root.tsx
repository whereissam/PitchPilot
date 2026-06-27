import { Composition } from "remotion";
import { PitchPilotVideo } from "./PitchPilot";

// 30 fps · 28 s = 840 frames · 1280x720
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="PitchPilot"
      component={PitchPilotVideo}
      durationInFrames={840}
      fps={30}
      width={1280}
      height={720}
    />
  );
};
