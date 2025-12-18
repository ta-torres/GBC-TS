import { Card } from "@/components/ui/pixelact-ui/card";
import { Button } from "@/components/ui/pixelact-ui/button";

interface EmuControllersProps {
  onLoadROMClick: () => void;
  fileName: string | null;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
  onStepFrame: () => void;
  isLoaded: boolean;
  isRunning: boolean;
}

export const EmuControllers = ({
  onLoadROMClick,
  fileName,
  onStart,
  onPause,
  onReset,
  onStep,
  onStepFrame,
  isLoaded,
  isRunning,
}: EmuControllersProps) => {
  return (
    <Card className="border-r-4 border-b-4 border-slate-500 bg-slate-400 p-4">
      <div>
        <Button
          type="button"
          onClick={onLoadROMClick}
          className="w-full cursor-pointer bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Load Game
        </Button>
        {fileName && (
          <div className="mt-1 text-xs text-gray-700">{fileName}</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={onStart}
          disabled={!isLoaded || isRunning}
          className="w-full rounded bg-green-600 px-4 py-2 font-medium hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Start
        </Button>

        <Button
          onClick={onReset}
          disabled={!isLoaded}
          className="w-full rounded bg-red-600 px-4 py-2 font-medium hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Reset
        </Button>

        <Button
          onClick={onPause}
          disabled={!isRunning}
          className="col-span-2 w-full rounded bg-yellow-600 px-4 py-2 font-medium hover:bg-yellow-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Pause
        </Button>

        <p className="col-span-2 ml-5 text-xs">Step</p>
        <Button
          onClick={onStepFrame}
          disabled={!isLoaded || isRunning}
          className="w-full rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Frame
        </Button>
        <Button
          onClick={onStep}
          disabled={!isLoaded || isRunning}
          className="w-full rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Opcode
        </Button>
      </div>
    </Card>
  );
};
