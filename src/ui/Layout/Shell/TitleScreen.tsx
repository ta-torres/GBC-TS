import { Button } from "@/components/ui/pixelact-ui/button";
import titleScreenBackground from "./title-screen.png";

interface TitleScreenProps {
  onLoadGame: () => void;
  onOpenMenu: () => void;
}

export const TitleScreen = ({ onLoadGame, onOpenMenu }: TitleScreenProps) => {
  return (
    <div
      className="absolute inset-0 flex h-full w-full flex-col items-center justify-center bg-[#8bac0f] bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `url(${titleScreenBackground})`,
        imageRendering: "pixelated",
      }}
    >
      <div
        className="mb-3 text-[12px] text-[#0f380f]"
        style={{
          fontFamily: "'Press Start 2P', monospace",
        }}
      >
        GBC-TS
      </div>
      <div className="flex flex-col items-center gap-2">
        <Button
          variant="default"
          className="h-8 w-full bg-[#306230] text-[8px] text-gray-100 after:border-r-[#0f380f]! after:border-b-[#0f380f]! hover:bg-[#0f380f]! focus:bg-[#0f380f]!"
          onClick={onLoadGame}
        >
          Load a Game
        </Button>
        <Button
          variant="default"
          className="h-8 w-full bg-[#306230] text-[8px] text-gray-100 after:border-r-[#0f380f]! after:border-b-[#0f380f]! hover:bg-[#0f380f]! focus:bg-[#0f380f]!"
          onClick={onOpenMenu}
        >
          Settings
        </Button>
      </div>
    </div>
  );
};
