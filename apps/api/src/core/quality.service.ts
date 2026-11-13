/**
 * Qualité du code (ADR-0007, T-0176) : contrat de lecture des mesures d'un projet, indépendant du fournisseur. Aucun fournisseur n'est
 * branché dans cette version (SonarQube : lot 14) ; la réponse « non relié » est le seul état produit, et l'interface s'en sert pour
 * proposer de relier le fournisseur depuis l'administration.
 */
export interface QualityMeasures {
  gate: 'passed' | 'failed' | 'unknown';
  coverage: number | null; bugs: number; vulnerabilities: number; smells: number; debtMinutes: number | null; analyzedAt: string | null;
}
export interface QualityView { connected: boolean; provider: string | null; measures: QualityMeasures | null }
export interface QualityProvider { name: string; measures(organizationId: string, projectKey: string): Promise<QualityMeasures | null> }

export class QualityService {
  constructor(private readonly provider: QualityProvider | null = null) {}

  async get(organizationId: string, projectKey: string): Promise<QualityView> {
    if (!this.provider) return { connected: false, provider: null, measures: null };
    try {
      const measures = await this.provider.measures(organizationId, projectKey);
      return { connected: measures !== null, provider: this.provider.name, measures };
    } catch { return { connected: false, provider: this.provider.name, measures: null }; }
  }
}
