import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDeviceId, getStoredName, setStoredName } from "@/lib/device";
import { joinGameByCode } from "@/lib/join-game";

export const Route = createFileRoute("/join/scan")({
  head: () => ({
    meta: [
      { title: "Campfire — Scanner un QR Code" },
      { name: "description", content: "Scannez un QR Code pour rejoindre une partie." },
    ],
  }),
  component: JoinScanPage,
});

function extractCode(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/\/lobby\/([A-Z0-9]+)/i);
  if (match) return match[1].toUpperCase();
  return trimmed.toUpperCase();
}

function JoinScanPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(getStoredName());
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const containerId = "campfire-qr-reader";

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current?.clear();
          scannerRef.current = null;
        });
      }
    };
  }, []);

  async function startScan() {
    if (!displayName.trim()) {
      setError("Renseigne d'abord ton pseudo.");
      return;
    }
    setError(null);
    setStoredName(displayName.trim());
    setScanning(true);
    try {
      const mod = await import("html5-qrcode");
      const Html5Qrcode = mod.Html5Qrcode;
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner as unknown as {
        stop: () => Promise<void>;
        clear: () => void;
      };
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded: string) => {
          if (busy) return;
          setBusy(true);
          try {
            await scanner.stop();
            scanner.clear();
            scannerRef.current = null;
          } catch {
            // ignore
          }
          const code = extractCode(decoded);
          const result = await joinGameByCode({
            code,
            displayName,
            deviceId: getDeviceId(),
          });
          if ("error" in result) {
            setError(result.error);
            setScanning(false);
            setBusy(false);
            return;
          }
          navigate({ to: "/lobby/$code", params: { code: result.inviteCode } });
        },
        () => {
          // per-frame decode errors — silent
        },
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `Impossible d'ouvrir la caméra : ${err.message}`
          : "Impossible d'ouvrir la caméra.",
      );
      setScanning(false);
    }
  }

  return (
    <MobileShell>
      <div className="flex flex-1 flex-col gap-6 py-4">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold text-foreground">
            Scanner un QR Code
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pointe la caméra vers le QR Code de la partie.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pseudo">Ton pseudo</Label>
          <Input
            id="pseudo"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            placeholder="Aventurier·e"
            disabled={scanning}
            required
          />
        </div>

        <div
          id={containerId}
          className="mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl border border-rpg/30 bg-black/60"
        />

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {!scanning && (
          <button
            type="button"
            onClick={startScan}
            className="rpg-button"
          >
            <span className="font-display tracking-wide">Activer la caméra</span>
          </button>
        )}

        <Link to="/join" className="rpg-button">
          <ArrowLeft className="h-5 w-5 shrink-0 text-rpg" />
          <span className="font-display tracking-wide">Retour</span>
        </Link>
      </div>
    </MobileShell>
  );
}