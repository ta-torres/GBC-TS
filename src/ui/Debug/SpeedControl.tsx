import { useState } from "react";
import type { GBEmulator } from "@/emulator/gbEmulator";
import { Card } from "@/components/ui/pixelact-ui/card";
import { Button } from "@/components/ui/pixelact-ui/button";

interface SpeedControlProps {
  emulator: GBEmulator;
}

const SPEED_PRESETS = [1, 2, 4] as const;

type SpeedPreset = (typeof SPEED_PRESETS)[number];

export const SpeedControl = ({ emulator }: SpeedControlProps) => {
  const [speed, setSpeed] = useState<number>(1);

  const handleSetSpeed = (value: SpeedPreset) => {
    emulator.setSpeedMultiplier(value);
    setSpeed(emulator.getSpeedMultiplier());
  };

  return (
    <Card className="border-r-4 border-b-4 border-slate-500 bg-slate-400 p-4">
      <div className="flex flex-wrap justify-between gap-2">
        {SPEED_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            onClick={() => handleSetSpeed(preset)}
            className={`flex-1 px-3 py-1 text-xs font-semibold ${
              Math.abs(speed - preset) < 0.001
                ? "bg-green-600 hover:bg-green-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {preset.toString()}x
          </Button>
        ))}
      </div>
      <div className="flex items-center text-xs text-gray-800">
        Speed: <span>{speed.toFixed(2)}x</span>
      </div>
    </Card>
  );
};
