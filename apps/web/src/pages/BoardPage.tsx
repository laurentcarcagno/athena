import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, Id, PageHeader, StatusPill, useToast } from '@athena/ui';
import { api, type BoardView } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

type Card = BoardView['columns'][number]['cards'][number];

/** Board : glisser-déposer à la souris, et sélecteur « Déplacer vers » pour le clavier et les lecteurs d'écran. */
export function BoardPage() {
  const { project, board } = useParams();
  const [view, setView] = useState<BoardView | null>(null);
  const toast = useToast();
  const fail = useFailure();
  const load = useCallback(() => api<BoardView>('GET', `/v1/projects/${project}/boards/${board}`).then(setView), [project, board]);
  useEffect(() => { load().catch(fail); }, [load, fail]);

  const move = async (card: Card, column: string) => {
    try {
      await api('POST', `/v1/projects/${project}/boards/${board}/cards/${card.key}/move`, { column, version: card.version });
      toast('success', fr.board.moved);
    } catch (error) {
      fail(error);
    }
    await load().catch(fail);
  };
  const drop = (event: DragEvent, column: string) => {
    event.preventDefault();
    const data = event.dataTransfer.getData('application/x-athena-card');
    if (!data) return;
    const card = JSON.parse(data) as Card;
    void move(card, column);
  };

  if (!view) return <p role="status">{fr.loading}</p>;
  return (
    <>
      <PageHeader eyebrow={fr.board.eyebrow} title={view.name} sub={view.unmapped > 0 ? fr.board.unmapped(view.unmapped) : undefined} />
      <div className="ath-board">
        {view.columns.map((column) => (
          <section key={column.name} className={`ath-column${column.overLimit ? ' ath-column--over' : ''}`} aria-label={column.name} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, column.name)}>
            <header className="ath-column__head">
              <span className="ath-label">{column.name}</span>
              <span className="ath-mono">{column.count}{column.wipLimit !== null ? ` / ${column.wipLimit}` : ''}</span>
            </header>
            <div className="ath-column__cards">
              {column.cards.length === 0 && <p className="ath-eyebrow">{fr.board.empty}</p>}
              {column.cards.map((card) => (
                <article key={card.key} className="ath-ticket" draggable onDragStart={(e) => e.dataTransfer.setData('application/x-athena-card', JSON.stringify(card))}>
                  <Link className="ath-link" to={`/p/${project}/a/${card.key}`}><Id>{card.key}</Id></Link>
                  <p className="ath-ticket__title">{card.title}</p>
                  <div className="ath-row">
                    <StatusPill>{card.status}</StatusPill>
                    {card.assignee && <span className="ath-mono">{card.assignee}</span>}
                  </div>
                  <label className="ath-field__label" htmlFor={`mv-${card.key}`}>{fr.board.moveTo}</label>
                  <select id={`mv-${card.key}`} className="ath-select" value="" onChange={(e) => { if (e.target.value) void move(card, e.target.value); }}>
                    <option value="" />
                    {view.columns.filter((c) => c.name !== column.name).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      {view.columns.every((c) => c.cards.length === 0) && <EmptyState eyebrow={fr.board.eyebrow} title={fr.board.empty} />}
    </>
  );
}
