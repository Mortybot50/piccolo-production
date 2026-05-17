import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PinPad } from "@/components/PinPad";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

type Step = "old" | "new" | "confirm";

export default function ChangePinPage() {
  const navigate = useNavigate();
  const { changePin, user } = useAuth();
  const [step, setStep] = useState<Step>("old");
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function advance() {
    setError(null);
    if (step === "old" && oldPin.length === 4) {
      setStep("new");
    } else if (step === "new" && newPin.length === 4) {
      if (newPin === oldPin) {
        setError("New PIN must differ from old PIN.");
        setNewPin("");
        return;
      }
      setStep("confirm");
    } else if (step === "confirm" && confirm.length === 4) {
      if (confirm !== newPin) {
        setError("PINs don't match.");
        setConfirm("");
        return;
      }
      void submit();
    }
  }

  async function submit() {
    setBusy(true);
    const r = await changePin(oldPin, newPin);
    setBusy(false);
    if (r.ok) {
      toast.success("PIN updated");
      navigate("/today", { replace: true });
    } else {
      setError(r.reason);
      setStep("old");
      setOldPin("");
      setNewPin("");
      setConfirm("");
    }
  }

  const labels: Record<Step, string> = {
    old: "Enter your current PIN",
    new: "Choose a new 4-digit PIN",
    confirm: "Confirm new PIN",
  };
  const value = step === "old" ? oldPin : step === "new" ? newPin : confirm;
  const setter = step === "old" ? setOldPin : step === "new" ? setNewPin : setConfirm;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">Set a new PIN</CardTitle>
          <CardDescription>
            {user
              ? `Welcome ${user.display_name}. Please set a personal PIN before continuing.`
              : "Set a personal PIN to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <PinPad value={value} onChange={setter} label={labels[step]} disabled={busy} />
          {error ? (
            <p role="alert" className="text-center text-sm font-medium text-[var(--color-bad)]">
              {error}
            </p>
          ) : null}
          <Button
            size="lg"
            disabled={busy || value.length !== 4}
            onClick={advance}
          >
            {step === "confirm" ? (busy ? "Saving…" : "Save PIN") : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
