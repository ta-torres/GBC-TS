import { Card } from "@/components/ui/pixelact-ui/card";

interface DebugDataProps {
  info: string;
}

export const DebugData = ({ info }: DebugDataProps) => {
  return (
    <Card className="border-r-4 border-b-4 border-slate-500 bg-slate-400 p-4">
      <div className="font-mono text-sm whitespace-pre-wrap text-gray-900">
        {info || "No ROM loaded"}
      </div>
    </Card>
  );
};
