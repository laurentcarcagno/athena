import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { applyHardening } from '../security/hardening';
import { ExportMarker, } from './export-marking';
import { csvCell } from './normative.service';
import { parseCsv } from '../import/csv';

const marker = new ExportMarker('Diffusion Restreinte');

describe('mention de protection des exports', () => {
  it('niveau vide : aucun marquage, les exports restent identiques', () => {
    const none = new ExportMarker('');
    expect(none.active).toBe(false);
    expect(none.csv('a,b\n1,2\n')).toBe('a,b\n1,2\n');
    expect(none.yaml('k: v\n')).toBe('k: v\n');
    expect(none.markdown('# T')).toBe('# T');
    expect(none.json({ a: 1 })).toEqual({ a: 1 });
    expect(new ExportMarker(undefined).active).toBe(false);
  });

  it('CSV : mention en première et dernière lignes, BOM conservé en tête, données lisibles', () => {
    const out = marker.csv(`﻿reference,title\n5.1,"A, B"\n`);
    expect(out.startsWith('﻿"Diffusion Restreinte"\nreference,title\n')).toBe(true);
    expect(out.trimEnd().split('\n').pop()).toBe('"Diffusion Restreinte"');
    const rows = parseCsv(out);
    expect(rows[0]).toEqual(['Diffusion Restreinte']);
    expect(rows[1]).toEqual(['reference', 'title']);
    expect(rows[2]).toEqual(['5.1', 'A, B']);
    expect(rows.at(-1)).toEqual(['Diffusion Restreinte']);
    expect(csvCell('x')).toBe('x');
  });

  it('YAML, Markdown et JSON portent la mention en en-tête et en pied', () => {
    expect(marker.yaml('key: v\n')).toBe('# Diffusion Restreinte\nkey: v\n# Diffusion Restreinte\n');
    expect(marker.markdown('# Notes\n\ntexte\n')).toBe('**Diffusion Restreinte**\n\n# Notes\n\ntexte\n\n**Diffusion Restreinte**\n');
    expect(marker.json({ n: 1 })).toEqual({ n: 1, protection: 'Diffusion Restreinte' });
  });

  it('une mention ne peut pas casser le format (sauts de ligne, guillemets)', () => {
    const tricky = new ExportMarker('DR\nINJECTÉ: oui "x"');
    expect(tricky.level).toBe('DR INJECTÉ: oui "x"');
    expect(tricky.yaml('a: 1').split('\n')).toHaveLength(4);
    expect(parseCsv(tricky.csv('a\n1'))[0]).toEqual(['DR INJECTÉ: oui "x"']);
  });

  it('se règle par ATHENA_PROTECTION_LEVEL (vide par défaut)', () => {
    const base = { DATABASE_URL: 'postgres://x', KEYCLOAK_ISSUER: 'http://localhost/realms/a' };
    expect(loadConfig(base).ATHENA_PROTECTION_LEVEL).toBe('');
    expect(loadConfig({ ...base, ATHENA_PROTECTION_LEVEL: '  Diffusion Restreinte ' }).ATHENA_PROTECTION_LEVEL).toBe('Diffusion Restreinte');
  });

  it('chaque réponse de l’API porte l’en-tête X-Athena-Protection-Level quand le niveau est renseigné', async () => {
    for (const [level, expected] of [['Diffusion Restreinte', 'Diffusion Restreinte'], ['', undefined]] as const) {
      const fastify = Fastify();
      applyHardening(fastify, { apiPerMinute: 50, sensitivePerMinute: 5, hsts: false, protectionLevel: level });
      fastify.get('/v1/x', async () => ({ ok: true }));
      await fastify.ready();
      expect((await fastify.inject({ method: 'GET', url: '/v1/x' })).headers['x-athena-protection-level']).toBe(expected);
    }
  });
});
