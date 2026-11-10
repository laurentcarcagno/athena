import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Btn, EmptyState, Id, PageHeader, Select, StatusPill, Tag, useToast } from '@athena/ui';
import { api, type BoardView, type Session, type TrackerOverview } from '../api';
import { useCreate, useOnCreated } from '../components/CreateArtifact';
import { DetailPanel } from '../components/DetailPanel';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { fromHere } from '../lib/origin';

type Card = BoardView['columns'][number]['cards'][number];
type Lane = 'none' | 'assignee' | 'tracker';

/**
 * Board : glisser-déposer à la souris, et sélecteur « Déplacer vers » pour le clavier et les lecteurs d'écran.
 * T-0114 : un clic sur la carte ouvre le panneau de détail (`?i=`) ; filtres rapides et couloirs dans l'adresse
 * (`?q=`, `?moi=1`, `?bloques=1`, `?couloir=`) ; création depuis une colonne qui porte un statut initial.
 */
export function BoardView({ session, project, board, header = true }: { session: Session; project: string; board: string; header?: boolean }) {
  const [view, setView] = useState<BoardView | null>(null);
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const fail = useFailure();
  const location = useLocation();
  const navigate = useNavigate();
  const create = useCreate();
  const load = useCallback(() => api<BoardView>('GET', `/v1/projects/${project}/boards/${board}`).then(setView), [project, board]);
  useEffect(() => { load().catch(fail); }, [load, fail]);
  useOnCreated(() => { load().catch(fail); });

  const item = params.get('i');
  const text = params.get('q') ?? '';
  const mine = params.get('moi') === '1';
  const blockedOnly = params.get('bloques') === '1';
  const laneBy: Lane = (['assignee', 'tracker'] as const).find((l) => l === params.get('couloir')) ?? 'none';
  const me = session.user?.id ?? session.user?.username ?? '';
  // Un filtre remplace l'entrée d'historique (la saisie ne crée pas une entrée par lettre) ; ouvrir une carte en ajoute une.
  const update = (changes: Record<string, string | null>, push = false) => setParams((current) => {
    const next = new URLSearchParams(current);
    for (const [k, v] of Object.entries(changes)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    return next;
  }, { replace: !push });
  const openCard = (key: string | null) => update(key ? { i: key } : { i: null, onglet: null }, true);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !item || document.querySelector('[role="dialog"]')) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      event.preventDefault();
      openCard(null);
      setTimeout(() => document.getElementById(`card-${item}`)?.focus(), 0);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

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
  const needle = text.trim().toLowerCase();
  const shown = (card: Card) => (!needle || card.key.toLowerCase().includes(needle) || card.title.toLowerCase().includes(needle))
    && (!mine || card.assignee === me) && (!blockedOnly || card.blocked === true);
  const allKeys = view.columns.flatMap((c) => c.cards.filter(shown).map((x) => x.key));
  const laneOf = (card: Card): string => (laneBy === 'assignee' ? card.assigneeName ?? card.assignee ?? fr.board.noAssignee : laneBy === 'tracker' ? card.trackerName ?? card.tracker : '');
  const lanes = laneBy === 'none' ? [''] : [...new Set(view.columns.flatMap((c) => c.cards.filter(shown).map(laneOf)))].sort();
  const firstTracker = view.trackers?.[0];
  const filtering = needle !== '' || mine || blockedOnly;
  const renderBoard = (lane: string) => {
    const cardsOf = (column: BoardView['columns'][number]) => column.cards.filter(shown).filter((c) => laneBy === 'none' || laneOf(c) === lane);
    return (
      <div className="ath-board">
        {view.columns.map((column) => (
          <section key={column.name} className={`ath-column${column.overLimit ? ' ath-column--over' : ''}`} aria-label={column.name} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, column.name)}>
            <header className="ath-column__head">
              <span className="ath-label">{column.name}</span>
              <span className="ath-row">
                <span className="ath-mono">{filtering || laneBy !== 'none' ? cardsOf(column).length : column.count}{column.wipLimit !== null ? ` / ${column.wipLimit}` : ''}</span>
                {column.creatable && firstTracker && (
                  <Btn size="sm" variant="ghost" icon="plus" aria-label={fr.board.createIn(column.name)} title={fr.board.createIn(column.name)}
                    onClick={() => create({ scope: 'tracker', project, tracker: firstTracker })} />
                )}
              </span>
            </header>
            <div className="ath-column__cards">
              {cardsOf(column).length === 0 && <p className="ath-eyebrow">{fr.board.empty}</p>}
              {cardsOf(column).map((card) => (
                <article key={card.key} className={`ath-ticket${item === card.key ? ' ath-row--selected' : ''}`} draggable onDragStart={(e) => e.dataTransfer.setData('application/x-athena-card', JSON.stringify(card))}>
                  <div className="ath-row">
                    <Link id={`card-${card.key}`} className="ath-link" to={`?${new URLSearchParams({ ...Object.fromEntries(params), i: card.key }).toString()}`}
                      aria-current={item === card.key ? 'true' : undefined} onClick={(e) => { e.preventDefault(); openCard(card.key); }}><Id>{card.key}</Id></Link>
                    {card.trackerName && <Tag variant="ghost">{card.trackerName}</Tag>}
                    {card.blocked && <StatusPill kind="warning">{fr.board.blocked}</StatusPill>}
                  </div>
                  <p className="ath-ticket__title">{card.title}</p>
                  <div className="ath-row">
                    <StatusPill>{card.statusName ?? card.status}</StatusPill>
                    {card.priority && <span title={card.priorityLabel ?? undefined}>{card.priority}</span>}
                    {card.due && <span className="ath-mono">{card.due}</span>}
                    {card.assignee && <span>{card.assigneeName ?? card.assignee}</span>}
                  </div>
                  <label className="ath-field__label" htmlFor={`mv-${card.key}`}>{fr.board.moveTo}</label>
                  <Select id={`mv-${card.key}`} value="" onChange={(e) => { if (e.target.value) void move(card, e.target.value); }}>
                    <option value="" />
                    {view.columns.filter((c) => c.name !== column.name).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </Select>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  };
  const content = (
    <div>
      <div className="ath-toolbar">
        <label className="ath-field__label" htmlFor="board-filter">{fr.board.filter}</label>
        <input id="board-filter" className="ath-input" type="search" value={text} onChange={(e) => update({ q: e.target.value })} />
        <Btn size="sm" variant="ghost" aria-pressed={mine} onClick={() => update({ moi: mine ? null : '1' })}>{fr.board.mine}</Btn>
        <Btn size="sm" variant="ghost" aria-pressed={blockedOnly} onClick={() => update({ bloques: blockedOnly ? null : '1' })}>{fr.board.blockedOnly}</Btn>
        <label className="ath-field__label" htmlFor="lane-by">{fr.board.laneBy}</label>
        <Select id="lane-by" value={laneBy} onChange={(e) => update({ couloir: e.target.value === 'none' ? null : e.target.value })}>
          <option value="none">{fr.board.laneNone}</option><option value="assignee">{fr.board.laneAssignee}</option><option value="tracker">{fr.board.laneTracker}</option>
        </Select>
      </div>
      {lanes.map((lane) => (
        <section key={lane || 'all'} aria-label={lane || undefined}>
          {lane && <h2 className="ath-section-title">{lane}</h2>}
          {renderBoard(lane)}
        </section>
      ))}
      {view.columns.every((c) => c.cards.length === 0) ? <EmptyState eyebrow={fr.board.eyebrow} title={fr.board.empty} />
        : allKeys.length === 0 && <p role="status">{fr.board.noMatch}</p>}
    </div>
  );
  return (
    <>
      {header && <PageHeader eyebrow={fr.board.eyebrow} title={view.name} sub={view.unmapped > 0 ? fr.board.unmapped(view.unmapped) : undefined} />}
      <div className={item ? 'ath-split' : undefined}>
        {content}
        {item && (
          <DetailPanel session={session} project={project} itemKey={item} onClose={() => openCard(null)}
            onCanonicalKey={(key) => update({ i: key })}
            onExpand={() => {
              const tab = params.get('onglet');
              navigate(`/p/${project}/a/${item}${tab ? `?onglet=${encodeURIComponent(tab)}` : ''}`, { state: fromHere(location, view.name, allKeys) });
            }} />
        )}
      </div>
    </>
  );
}

/** Page d'un board de projet `/p/:projet/board/:board`. */
export function BoardPage({ session }: { session: Session }) {
  const { project, board } = useParams();
  return <BoardView session={session} project={String(project)} board={String(board)} />;
}

/** Index des boards `/p/:projet/board` : boards configurés du projet, puis le board de chaque tracker. */
export function BoardIndexPage() {
  const { project } = useParams();
  const fail = useFailure();
  const [boards, setBoards] = useState<Array<{ key: string; name: string }> | null>(null);
  const [trackers, setTrackers] = useState<TrackerOverview[]>([]);
  useEffect(() => {
    api<Array<{ key: string; name: string }>>('GET', `/v1/projects/${project}/boards`).then((b) => setBoards(Array.isArray(b) ? b : [])).catch((e: unknown) => { setBoards([]); fail(e); });
    api<{ trackers: TrackerOverview[] }>('GET', `/v1/projects/${project}/overview`).then((r) => setTrackers(r.trackers)).catch(() => setTrackers([]));
  }, [project, fail]);
  return (
    <>
      <PageHeader eyebrow={fr.board.eyebrow} title={fr.board.indexTitle} />
      {boards === null ? <p role="status">{fr.loading}</p> : (
        <div className="ath-stack">
          <h2 className="ath-section-title">{fr.board.projectBoards}</h2>
          {boards.length === 0 ? <p>{fr.board.noBoards}</p> : (
            <ul className="ath-stack" aria-label={fr.board.projectBoards}>
              {boards.map((b) => <li key={b.key}><Link className="ath-link" to={`/p/${project}/board/${b.key}`}>{b.name}</Link> <Id>{b.key}</Id></li>)}
            </ul>
          )}
          {trackers.length > 0 && <>
            <h2 className="ath-section-title">{fr.board.trackerBoards}</h2>
            <ul className="ath-stack" aria-label={fr.board.trackerBoards}>
              {trackers.map((t) => <li key={t.key}><Link className="ath-link" to={`/p/${project}/t/${t.key}/board`}>{t.name}</Link> <Id>{t.key}</Id></li>)}
            </ul>
          </>}
        </div>
      )}
    </>
  );
}
