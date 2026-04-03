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
import { useAudioSettings } from "../hooks/useAudioSettings";

interface Props {
  open: boolean;
  onClose: () => void;
  showBitrate: boolean;
}

export default function SettingsModal({ open, onClose, showBitrate }: Props) {
  const { settings, update } = useAudioSettings();

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
