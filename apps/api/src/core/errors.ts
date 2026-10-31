export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'validation' | 'conflict' | 'forbidden',
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new DomainError(`${what} introuvable.`, 'not_found');
export const validation = (details: string[]) =>
  new DomainError('Données invalides.', 'validation', details);
export const conflict = (message: string) => new DomainError(message, 'conflict');
export const forbidden = (message: string) => new DomainError(message, 'forbidden');
