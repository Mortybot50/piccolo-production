import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title: string;
  phase: string;
}

export default function Placeholder({ title, phase }: Props) {
  return (
    <AppShell title={title}>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-stone-600">
            Coming in <span className="font-mono">{phase}</span>.
          </p>
          <p className="mt-2 text-xs text-stone-400">
            Phase A scaffolds the foundation only. Real screens land in subsequent phases.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
