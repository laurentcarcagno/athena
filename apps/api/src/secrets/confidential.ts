import { OpenBao, orgKeyName } from './openbao';

const PREFIX = 'bao:v1:';

/** Chiffre les champs confidentiels avant écriture dans Git (plan § 4.6). Le clair ne quitte jamais la base. */
export class ConfidentialFields {
  constructor(private readonly bao: OpenBao) {}

  async protect(
    organizationKey: string, values: Record<string, unknown>, confidentialFields: string[],
  ): Promise<Record<string, unknown>> {
    if (confidentialFields.length === 0) return values;
    const result: Record<string, unknown> = { ...values };
    for (const field of confidentialFields) {
      const value = result[field];
      if (value === undefined || value === null) continue;
      const ciphertext = await this.bao.encrypt(orgKeyName(organizationKey), JSON.stringify(value), field);
      result[field] = `${PREFIX}${ciphertext}`;
    }
    return result;
  }

  async reveal(organizationKey: string, values: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = { ...values };
    for (const [field, value] of Object.entries(result)) {
      if (typeof value === 'string' && value.startsWith(PREFIX)) {
        const clear = await this.bao.decrypt(orgKeyName(organizationKey), value.slice(PREFIX.length), field);
        result[field] = JSON.parse(clear) as unknown;
      }
    }
    return result;
  }
}
