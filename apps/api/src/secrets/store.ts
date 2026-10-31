import type { SecretStore } from '../webhooks/webhook.service';
import type { OpenBao } from './openbao';

/** Adaptateur : les secrets des intégrations (webhooks, GitLab) vivent dans OpenBao KV. */
export class OpenBaoSecretStore implements SecretStore {
  constructor(private readonly bao: OpenBao) {}
  put(path: string, data: Record<string, string>): Promise<void> {
    return this.bao.kvPut(path, data);
  }
  get(path: string): Promise<Record<string, string> | null> {
    return this.bao.kvGet(path);
  }
}

/** Repli explicite quand OpenBao n'est pas configuré : refuse plutôt que de stocker en clair. */
export class UnavailableSecretStore implements SecretStore {
  put(): Promise<void> {
    return Promise.reject(new Error('OpenBao non configuré : stockage de secrets indisponible'));
  }
  get(): Promise<Record<string, string> | null> {
    return Promise.reject(new Error('OpenBao non configuré : stockage de secrets indisponible'));
  }
}
