import { useCallback, useState, type ReactNode } from 'react';
import { Btn, Modal } from '@athena/ui';
import { fr } from '../i18n';

interface Request { title: string; body: string; confirm: string; resolve: (ok: boolean) => void }

/** Confirmation d'une action irréversible (charte §5.7) : titre nommant l'objet, conséquence, bouton danger. */
export function useConfirm(): { ask: (o: { title: string; body: string; confirm: string }) => Promise<boolean>; dialog: ReactNode } {
  const [request, setRequest] = useState<Request | null>(null);
  const ask = useCallback((o: { title: string; body: string; confirm: string }) => new Promise<boolean>((resolve) => setRequest({ ...o, resolve })), []);
  const close = (ok: boolean) => { request?.resolve(ok); setRequest(null); };
  const dialog = (
    <Modal open={request !== null} title={request?.title ?? ''} onClose={() => close(false)}
      footer={<><Btn icon="close" variant="ghost" onClick={() => close(false)}>{fr.confirm.cancel}</Btn><Btn variant="danger" onClick={() => close(true)}>{request?.confirm}</Btn></>}>
      <p>{request?.body}</p>
    </Modal>
  );
  return { ask, dialog };
}
