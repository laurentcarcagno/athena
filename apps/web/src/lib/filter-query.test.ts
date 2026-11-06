import { describe, expect, it } from 'vitest';
import { atqlValue, emptyModel, fromAtql, isEmpty, toAtql, type FilterModel } from './filter-query';

const user = 'alice';

describe('filtres en puces et ATQL', () => {
  it('compose le fragment dans un ordre stable', () => {
    expect(toAtql(emptyModel(), user)).toBe('');
    expect(toAtql({ status: 'open', mine: true, text: 'crash', fields: { severity: 'majeure', affected_version: '1.2' } }, user))
      .toBe('status = open AND assignee = "alice" AND affected_version = "1.2" AND severity = majeure AND text ~ "crash"');
    expect(toAtql({ mine: true, suspect: true, fields: {} }, user)).toBe('assignee = "alice" AND suspect()');
  });

  it('met entre guillemets ce qui n’est pas un mot, en échappant guillemets et barres obliques', () => {
    expect(atqlValue('majeure')).toBe('majeure');
    expect(atqlValue('très haute')).toBe('"très haute"');
    expect(atqlValue('2')).toBe('"2"');
    expect(atqlValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it('revient du fragment au modèle (aller-retour)', () => {
    const cases: FilterModel[] = [
      emptyModel(),
      { status: 'in_progress', fields: {} },
      { mine: true, fields: {} },
      { text: 'mot de passe "coffre"', fields: {} },
      { status: 'open', mine: true, text: 'x AND y', fields: { severity: 'très haute', version: '2' } },
      { suspect: true, fields: {} },
      { status: 'open', suspect: true, fields: { severity: 'majeure' } },
    ];
    for (const model of cases) expect(fromAtql(toAtql(model, user), user)).toEqual(model);
  });

  it('un assigné autre que moi reste un filtre de champ', () => {
    expect(fromAtql('assignee = "bob"', user)).toEqual({ fields: { assignee: 'bob' } });
    expect(fromAtql('text ~ crash', user)).toEqual({ text: 'crash', fields: {} }); // mot nu accepté, réécrit entre guillemets
  });

  it('refuse (null) tout ce qui n’est pas une conjonction de puces', () => {
    for (const q of ['status = open OR status = done', 'NOT status = open', '(status = open)', 'status IN (open, done)', 'status != open', 'priority > 2', 'status = open AND status = done',
      'severity = a AND severity = b', 'suspect() AND suspect()', 'notLinked("verifies")', 'linkedTo(ARI-REQ-0001)', 'NOT suspect()', 'title ~ "x"', 'status =', 'status = "ouvert', 'assignee IS EMPTY', 'ORDER BY key']) {
      expect(fromAtql(q, user), q).toBeNull();
    }
  });

  it('ne coupe pas un AND placé dans une chaîne', () => {
    expect(fromAtql('text ~ "a AND b" AND status = open', user)).toEqual({ text: 'a AND b', status: 'open', fields: {} });
  });

  it('reconnaît un modèle vide', () => {
    expect(isEmpty(emptyModel())).toBe(true);
    expect(isEmpty({ fields: { a: 'b' } })).toBe(false);
  });
});
