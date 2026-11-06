import { describe, expect, it } from 'vitest';
import { parseClauses } from './clause-csv';

describe('import CSV de clauses', () => {
  it('lit référence, titre et texte (virgule), en-têtes en français ou en anglais', () => {
    const r = parseClauses('Référence,Titre,Texte\n5.2.1,Plan de développement,"Le fournisseur établit, tient à jour un plan."\n5.2.2,Revue,Texte 2\n');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, reference: '5.2.1', title: 'Plan de développement', text: 'Le fournisseur établit, tient à jour un plan.', standard: '' },
      { line: 3, reference: '5.2.2', title: 'Revue', text: 'Texte 2', standard: '' },
    ]);
    expect(parseClauses('reference,title,statement\nA,B,C').rows[0]).toMatchObject({ reference: 'A', title: 'B', text: 'C' });
  });

  it('ignore le BOM et détecte le point-virgule et la tabulation', () => {
    const bom = parseClauses('﻿référence;titre;texte\n1;Un;Deux\n');
    expect(bom.rows).toEqual([{ line: 2, reference: '1', title: 'Un', text: 'Deux', standard: '' }]);
    const tab = parseClauses('reference\ttitle\ttext\n1\tUn\tDeux\n');
    expect(tab.rows[0]).toMatchObject({ reference: '1', title: 'Un', text: 'Deux' });
  });

  it('gère guillemets doublés et retours à la ligne dans un champ, et la colonne norme', () => {
    const r = parseClauses('reference,title,text,norme\n1,"Titre ""cité""","ligne 1\nligne 2",ECSS-E-ST-40C\n');
    expect(r.rows[0]).toMatchObject({ title: 'Titre "cité"', text: 'ligne 1\nligne 2', standard: 'ECSS-E-ST-40C' });
  });

  it('signale les doublons, références et titres manquants avec leur numéro de ligne, sans arrêter les autres', () => {
    const r = parseClauses('reference,title,text\n1,Un,a\n2,Deux,b\n1,Doublon,c\n,Sans référence,d\n3,,e\n4,Quatre,f\n');
    expect(r.rows.map((x) => x.reference)).toEqual(['1', '2', '4']);
    expect(r.errors).toEqual([
      { line: 4, reference: '1', message: 'doublon de la ligne 2' },
      { line: 5, reference: '', message: 'référence manquante' },
      { line: 6, reference: '3', message: 'titre manquant' },
    ]);
  });

  it('refuse un fichier vide ou sans les colonnes attendues', () => {
    expect(() => parseClauses('')).toThrow(/vide/);
    expect(() => parseClauses('a,b\n1,2')).toThrow(/colonnes attendues : référence, titre, texte/);
    expect(() => parseClauses('reference,title\n"1,2')).toThrow(/guillemet non fermé/);
  });
});
