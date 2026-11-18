import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { publishTicketChange, useTicketChanges } from './ticket-events';

const change = (project: string) => ({ id: '1', event: 'artifact.updated', key: `${project}-T-0001`, project, fields: ['title'] });

describe('flux des changements de tickets', () => {
  it('ne réveille que les pages du projet concerné et se désabonne au démontage', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useTicketChanges('ARI', handler));
    publishTicketChange(change('NOVA'));
    expect(handler).not.toHaveBeenCalled();
    publishTicketChange(change('ARI'));
    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
    publishTicketChange(change('ARI'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
