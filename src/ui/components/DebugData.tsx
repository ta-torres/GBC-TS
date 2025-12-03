interface DebugDataProps {
  info: string;
}

export const DebugData = ({ info }: DebugDataProps) => {
  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <div className="font-mono text-sm whitespace-pre-wrap text-green-400">
        {info || "No ROM loaded"}
      </div>
    </div>
  );
};
