import { useEffect, useState } from 'react';
import { Card, Chart } from '@athena/ui';
import { api } from '../api';
import { fr } from '../i18n';

interface Data { periods: Array<{ key: string; plannedMinutes: number; consumedMinutes: number }>; byPerson: Array<{ subject: string; name: string; consumedMinutes: number }> }
const iso = (d: Date) => d.toISOString().split('T')[0]!;

/** Planifié contre consommé d'un projet (lot 22, B36) : allocations contre temps passé, six mois autour d'aujourd'hui. Absente sans donnée ou sans la fonctionnalité Capacité. */
export function PlannedVsConsumedCard({ project, today = new Date() }: { project: string; today?: Date }) {
  const t = fr.worklog;
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    const from = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1)));
    const to = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 4, 0)));
    api<Data>('GET', `/v1/projects/${project}/planned-vs-consumed?from=${from}&to=${to}&granularity=month`).then((d) => setData(d && Array.isArray(d.periods) ? d : null)).catch(() => setData(null));
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || data.periods.every((p) => p.plannedMinutes === 0 && p.consumedMinutes === 0)) return null;
  return (
    <Card title={t.plannedVsConsumed}>
      <Chart type="bar" title={t.plannedVsConsumed} unit={t.hoursUnit} categories={data.periods.map((p) => p.key)}
        series={[{ name: t.planned, data: data.periods.map((p) => Math.round(p.plannedMinutes / 60)) }, { name: t.consumed, data: data.periods.map((p) => Math.round(p.consumedMinutes / 60)) }]} />
    </Card>
  );
}
