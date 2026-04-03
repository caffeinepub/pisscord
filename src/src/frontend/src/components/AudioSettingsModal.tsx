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
  showBitrate?: boolean;
}

function SettingRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <Label
          htmlFor={id}
          className="text-dc-primary font-medium cursor-pointer"
        >
          {label}
        </Label>
        <p className="text-xs text-dc-muted mt-0.5">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        data-ocid={`audio_settings.${id}.toggle`}
      />
    </div>
  );
}

export default function AudioSettingsModal({
  open,
  onClose,
  showBitrate = false,
}: Props) {
  const { settings, update } = useAudioSettings();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="bg-dc-sidebar border-dc-serverbar text-dc-primary max-w-md"
        data-ocid="audio_settings.dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-dc-primary">Audio Settings</DialogTitle>
        </DialogHeader>

        <div className="divide-y divide-dc-serverbar">
          <SettingRow
            id="noise-suppression"
            label="Noise Suppression"
            description="Filter background noise — may cause robotic voice"
            checked={settings.noiseSuppression}
            onCheckedChange={(v) => update({ noiseSuppression: v })}
          />
          <SettingRow
            id="auto-gain-control"
            label="Auto Gain Control"
            description="Automatically adjust mic volume"
            checked={settings.autoGainControl}
            onCheckedChange={(v) => update({ autoGainControl: v })}
          />
          <SettingRow
            id="echo-cancellation"
            label="Echo Cancellation"
            description="Reduce echo from speakers"
            checked={settings.echoCancellation}
            onCheckedChange={(v) => update({ echoCancellation: v })}
          />

          {showBitrate && (
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="flex-1 min-w-0">
                <Label className="text-dc-primary font-medium">
                  Voice Bitrate
                </Label>
                <p className="text-xs text-dc-muted mt-0.5">
                  Higher bitrate = better quality, more bandwidth
                </p>
              </div>
              <Select
                value={String(settings.bitrate)}
                onValueChange={(v) =>
                  update({ bitrate: Number(v) as 32 | 64 | 128 })
                }
              >
                <SelectTrigger
                  className="w-28 bg-dc-chat border-dc-serverbar text-dc-primary"
                  data-ocid="audio_settings.bitrate.select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-dc-sidebar border-dc-serverbar">
                  <SelectItem
                    value="32"
                    className="text-dc-primary focus:bg-dc-active"
                  >
                    32 kbps
                  </SelectItem>
                  <SelectItem
                    value="64"
                    className="text-dc-primary focus:bg-dc-active"
                  >
                    64 kbps
                  </SelectItem>
                  <SelectItem
                    value="128"
                    className="text-dc-primary focus:bg-dc-active"
                  >
                    128 kbps
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <p className="text-xs text-dc-muted mt-2">
          Changes apply the next time you join a voice channel.
        </p>
      </DialogContent>
    </Dialog>
  );
}
