import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";

export default function PrimitivesPage() {
  const [throwError, setThrowError] = useState(false);
  if (throwError) {
    throw new Error("Deliberate ErrorBoundary test from /__primitives");
  }

  return (
    <AppShell title="Design system primitives">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>All variants and sizes</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button size="xl">XL</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <Label htmlFor="ex-name">Name</Label>
              <Input id="ex-name" placeholder="Damian" />
            </div>
            <div>
              <Label htmlFor="ex-qty">Quantity</Label>
              <Input id="ex-qty" type="number" inputMode="numeric" placeholder="0" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Badges & status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="ok">OK</Badge>
            <Badge variant="warn">Warn</Badge>
            <Badge variant="bad">Bad</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Typography</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold">Display heading</h1>
            <h2 className="text-2xl font-semibold">Section heading</h2>
            <p className="text-base text-stone-700">Body copy in Inter.</p>
            <p className="font-mono text-sm text-stone-700">123.45 / JetBrains Mono</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overlays</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Example dialog</DialogTitle>
                  <DialogDescription>Centre modal pattern.</DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">Open sheet</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Example sheet</SheetTitle>
                </SheetHeader>
                <p className="mt-4 text-sm text-stone-600">Side panel pattern.</p>
              </SheetContent>
            </Sheet>
            <Button onClick={() => toast.success("Toast fired")}>Fire toast</Button>
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Error boundary smoke test</CardTitle>
            <CardDescription>Crashes the React tree on purpose to verify the boundary renders.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setThrowError(true)}>
              Throw error
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
