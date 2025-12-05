import { Card } from "@/components/ui/pixelact-ui/card";

interface DebugDataProps {
  info: string;
}

export const DebugData = ({ info }: DebugDataProps) => {
  return (
    <Card className="p-4" style={{ backgroundColor: "#b7bac3" }}>
      <div className="font-mono text-sm whitespace-pre-wrap text-gray-900">
        {info || "No ROM loaded"}
      </div>
    </Card>
  );
};
