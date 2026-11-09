import { Card, PageHeader, Table, Td, Th } from '@athena/ui';
import { fr } from '../i18n';
import { Markdown } from '../lib/markdown';
import guide from '../../../../docs/user/GUIDE.md?raw';

/** Aide intégrée : raccourcis, requêtes ATQL, rôles. Même place sur toutes les pages (barre latérale). */
export function HelpPage() {
  const rows = (items: string[][]) => <tbody>{items.map(([a, b]) => <tr key={a}><Td mono>{a}</Td><Td>{b}</Td></tr>)}</tbody>;
  return (
    <>
      <PageHeader eyebrow={fr.help.eyebrow} title={fr.help.title} />
      <div className="ath-stack">
        <Card title={fr.help.guideTitle}><div className="ath-stack"><Markdown source={guide} /></div></Card>
        <Card title={fr.help.shortcuts}><Table><thead><tr><Th>{fr.help.key}</Th><Th>{fr.help.effect}</Th></tr></thead>{rows(fr.help.shortcutRows)}</Table></Card>
        <Card title={fr.help.atql}><Table><thead><tr><Th>{fr.help.example}</Th><Th>{fr.help.meaning}</Th></tr></thead>{rows(fr.help.atqlRows)}</Table></Card>
        <Card title={fr.help.roles}><Table><thead><tr><Th>{fr.help.role}</Th><Th>{fr.help.capabilities}</Th></tr></thead>{rows(fr.help.roleRows)}</Table></Card>
      </div>
    </>
  );
}
