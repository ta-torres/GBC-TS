import { useEffect, useState } from "react";
import { Card } from "@/components/ui/pixelact-ui/card";
import type { GBEmulator } from "@/emulator/gbEmulator";

interface DebugDataProps {
  emulator: GBEmulator | null;
}

export const DebugData = ({ emulator }: DebugDataProps) => {
  const [info, setInfo] = useState("");

  useEffect(() => {
    let rafId = 0;
    let lastUpdate = 0;

    const loop = () => {
      if (emulator) {
        const now = performance.now();
        if (now - lastUpdate > 1000) {
          lastUpdate = now;
          setInfo(emulator.getCPUState());
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    if (emulator) {
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [emulator]);

  return (
    <Card className="border-r-4 border-b-4 border-slate-500 bg-slate-400 p-4">
      <div className="font-mono text-sm whitespace-pre-wrap text-gray-900">
        {info || "No ROM loaded"}
      </div>
    </Card>
  );
};
