import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useRef } from "react";
import { useAudioSettings } from "../hooks/useAudioSettings";
import UserAvatar from "./UserAvatar";

interface Props {
  open: boolean;
  onClose: () => void;
  showBitrate: boolean;
  myPrincipal?: string | null;
  myName?: string;
  // Photo props lifted from App.tsx so photo loads regardless of modal open state
  photoUrl: string | null;
  onSavePhoto: (dataUrl: string, principalStr?: string) => Promise<void>;
  onClearPhoto: (principalStr?: string) => Promise<void>;
}

export default function SettingsModal({
  open,
  onClose,
  showBitrate,
  myPrincipal,
  myName,
  photoUrl,
  onSavePhoto,
  onClearPhoto,
}: Props) {
  const { settings, update } = useAudioSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d")!;
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, 128, 128);
        onSavePhoto(
          canvas.toDataURL("image/jpeg", 0.85),
          myPrincipal ?? undefined,
        );
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be re-selected
    e.target.value = "";
  };

  const principal = myPrincipal || "";
  const name = myName || "U";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="bg-dc-sidebar border-dc-serverbar text-dc-primary max-w-md"
        data-ocid="settings.modal"
      >
        <DialogHeader>
          <DialogTitle className="text-dc-primary text-lg font-bold">
            Settings
          </DialogTitle>
        </DialogHeader>

        {/* Profile */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-dc-muted uppercase tracking-wider">
            Profile
          </p>
          <div className="flex items-center gap-4">
            <UserAvatar
              principal={principal}
              name={name}
              photoUrl={photoUrl}
              size={64}
              isMe
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                data-ocid="settings.profile.upload_button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-dc-blurple text-white text-xs font-medium rounded hover:opacity-90 transition-opacity"
              >
                Change Photo
              </button>
              {photoUrl && (
                <button
                  type="button"
                  data-ocid="settings.profile.delete_button"
                  onClick={() => onClearPhoto(myPrincipal ?? undefined)}
                  className="px-3 py-1.5 bg-dc-chat text-dc-secondary text-xs font-medium rounded hover:text-red-400 hover:bg-red-900/20 transition-colors"
                >
                  Remove Photo
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            data-ocid="settings.profile.dropzone"
          />
        </div>

        <div className="border-t border-dc-serverbar" />

        {/* Appearance */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-dc-muted uppercase tracking-wider">
            Appearance
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update({ theme: "discord" })}
              data-ocid="settings.discord_theme.toggle"
              className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
                settings.theme === "discord"
                  ? "bg-dc-blurple text-white"
                  : "bg-dc-chat text-dc-secondary hover:bg-dc-active hover:text-dc-primary"
              }`}
            >
              Discord
            </button>
            <button
              type="button"
              onClick={() => update({ theme: "skype" })}
              data-ocid="settings.skype_theme.toggle"
              className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
                settings.theme === "skype"
                  ? "bg-dc-blurple text-white"
                  : "bg-dc-chat text-dc-secondary hover:bg-dc-active hover:text-dc-primary"
              }`}
            >
              Skype
            </button>
          </div>
        </div>

        <div className="border-t border-dc-serverbar" />

        {/* Audio */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-dc-muted uppercase tracking-wider">
            Audio
          </p>

          <div className="flex items-center justify-between">
            <Label
              htmlFor="noise-suppression-switch"
              className="text-sm text-dc-secondary cursor-pointer"
            >
              Noise Suppression
            </Label>
            <Switch
              id="noise-suppression-switch"
              checked={settings.noiseSuppression}
              onCheckedChange={(v) => update({ noiseSuppression: v })}
              data-ocid="settings.noise_suppression.switch"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label
              htmlFor="auto-gain-switch"
              className="text-sm text-dc-secondary cursor-pointer"
            >
              Auto Gain Control
            </Label>
            <Switch
              id="auto-gain-switch"
              checked={settings.autoGainControl}
              onCheckedChange={(v) => update({ autoGainControl: v })}
              data-ocid="settings.auto_gain.switch"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label
              htmlFor="echo-cancel-switch"
              className="text-sm text-dc-secondary cursor-pointer"
            >
              Echo Cancellation
            </Label>
            <Switch
              id="echo-cancel-switch"
              checked={settings.echoCancellation}
              onCheckedChange={(v) => update({ echoCancellation: v })}
              data-ocid="settings.echo_cancel.switch"
            />
          </div>
        </div>

        {showBitrate && (
          <>
            <div className="border-t border-dc-serverbar" />
            <div className="space-y-3">
              <p className="text-xs font-bold text-dc-muted uppercase tracking-wider">
                Voice Quality
              </p>
              <div className="flex items-center justify-between gap-4">
                <Label
                  htmlFor="bitrate-select"
                  className="text-sm text-dc-secondary"
                >
                  Bitrate
                </Label>
                <Select
                  value={settings.bitrate.toString()}
                  onValueChange={(v) =>
                    update({ bitrate: Number(v) as 32 | 64 | 128 })
                  }
                >
                  <SelectTrigger
                    id="bitrate-select"
                    className="w-32 bg-dc-chat border-dc-serverbar text-dc-primary"
                    data-ocid="settings.bitrate.select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-dc-sidebar border-dc-serverbar">
                    <SelectItem
                      value="32"
                      className="text-dc-secondary focus:text-dc-primary focus:bg-dc-active"
                    >
                      32 kbps
                    </SelectItem>
                    <SelectItem
                      value="64"
                      className="text-dc-secondary focus:text-dc-primary focus:bg-dc-active"
                    >
                      64 kbps
                    </SelectItem>
                    <SelectItem
                      value="128"
                      className="text-dc-secondary focus:text-dc-primary focus:bg-dc-active"
                    >
                      128 kbps
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        <p className="text-xs text-dc-muted pt-1">
          Audio changes apply next time you join a voice channel.
        </p>
      </DialogContent>
    </Dialog>
  );
}
