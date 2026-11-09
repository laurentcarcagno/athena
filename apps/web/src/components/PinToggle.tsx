import { Btn } from '@athena/ui';
import { fr } from '../i18n';
import { usePins, type PinEntry } from '../lib/pins';

/** Épingle ou désépingle un projet, un tracker ou une vue dans les favoris du rail. */
export function PinToggle({ entry }: { entry: PinEntry }) {
  const pins = usePins();
  const pinned = pins.isFavorite(entry);
  return (
    <Btn type="button" variant="ghost" size="sm" icon="star" aria-pressed={pinned} onClick={() => void pins.toggle(entry)}>
      {pinned ? fr.rail.unpin : fr.rail.pin}
    </Btn>
  );
}
