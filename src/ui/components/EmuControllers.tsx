import { useRef, useState, type ChangeEvent } from "react";
import { Card } from "@/components/ui/pixelact-ui/card";
import { Button } from "@/components/ui/pixelact-ui/button";

interface EmuControllersProps {
  onLoadROM: (file: File) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
  isLoaded: boolean;
  isRunning: boolean;
}

export const EmuControllers = ({
  onLoadROM,
  onStart,
  onPause,
  onReset,
  onStep,
  isLoaded,
  isRunning,
}: EmuControllersProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      onLoadROM(file);
    }
  };

  return (
    <Card className="p-4" style={{ backgroundColor: "#b7bac3" }}>
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gb,.gbc"
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full cursor-pointer bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Load Game
        </Button>
        {fileName && (
          <div className="mt-1 text-xs text-gray-700">{fileName}</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={onStart}
          disabled={!isLoaded || isRunning}
          className="w-full rounded bg-green-600 px-4 py-2 font-medium hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Start
        </Button>

        <Button
          onClick={onPause}
          disabled={!isRunning}
          className="w-full rounded bg-yellow-600 px-4 py-2 font-medium hover:bg-yellow-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Pause
        </Button>

        <Button
          onClick={onReset}
          disabled={!isLoaded}
          className="w-full rounded bg-red-600 px-4 py-2 font-medium hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Reset
        </Button>

        <Button
          onClick={onStep}
          disabled={!isLoaded || isRunning}
          className="w-full rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Step
        </Button>
      </div>
    </Card>
  );
};
