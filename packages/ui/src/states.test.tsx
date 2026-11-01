import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Btn, ToastProvider, useToast } from './components';

function Fire({ kind }: { kind: 'success' | 'danger' }) {
  const toast = useToast();
  return <button type="button" onClick={() => toast(kind, 'Message')}>go</button>;
}

describe('F-02 : durée des toasts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const show = (kind: 'success' | 'danger') => {
    render(<ToastProvider duration={5000}><Fire kind={kind} /></ToastProvider>);
    fireEvent.click(screen.getByText('go'));
  };
  it('un succès disparaît après la durée', () => {
    show('success');
    expect(screen.getByText('Message')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByText('Message')).toBeNull();
  });
  it('une erreur reste jusqu’à sa fermeture', () => {
    show('danger');
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByText('Message')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la notification' }));
    expect(screen.queryByText('Message')).toBeNull();
  });
  it('un succès est suspendu pendant que le focus est dans le toast', () => {
    show('success');
    fireEvent.focus(screen.getByRole('status'));
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.getByText('Message')).toBeInTheDocument();
  });
});

describe('F-08 : état loading du bouton', () => {
  it('désactive, annonce aria-busy et suffixe le libellé', () => {
    render(<Btn loading>Créer</Btn>);
    const b = screen.getByRole('button');
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).toHaveTextContent('Créer…');
  });
  it('est inchangé sans loading', () => {
    render(<Btn>Créer</Btn>);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button')).toBeEnabled();
  });
});
