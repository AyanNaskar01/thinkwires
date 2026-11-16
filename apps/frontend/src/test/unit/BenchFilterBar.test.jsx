import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import BenchFilterBar from '../../components/BenchComponents/BenchFilterBar';

describe('BenchFilterBar Quick Notice Period Toggles (Issue #166)', () => {
  it('renders quick toggles for Immediate (48h), Within 7 Days, and Within 15 Days', () => {
    renderWithProviders(<BenchFilterBar totalCount={42} />);

    expect(screen.getByRole('button', { name: /immediate \(48h\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /within 7 days/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /within 15 days/i })).toBeInTheDocument();
  });

  it('sets active class when a quick toggle matches activeNoticePeriod', () => {
    const preloadedState = {
      bench: {
        activeNoticePeriod: 'Within 7 Days',
      },
    };

    renderWithProviders(<BenchFilterBar totalCount={42} />, { preloadedState });

    const btn7 = screen.getByRole('button', { name: /within 7 days/i });
    expect(btn7).toHaveClass('is-active');

    const btn48 = screen.getByRole('button', { name: /immediate \(48h\)/i });
    expect(btn48).not.toHaveClass('is-active');
  });

  it('updates state when clicking a quick toggle button', () => {
    const { store } = renderWithProviders(<BenchFilterBar totalCount={42} />);

    const btn48 = screen.getByRole('button', { name: /immediate \(48h\)/i });
    fireEvent.click(btn48);

    expect(store.getState().bench.activeNoticePeriod).toBe('Immediate (48h)');
  });
});

describe('BenchFilterBar Search Bar & Custom Dropdowns', () => {
  it('renders search bar with search icon', () => {
    const { container } = renderWithProviders(<BenchFilterBar totalCount={42} />);

    const searchIcon = container.querySelector('.BenchFilter-searchIcon');
    expect(searchIcon).toBeInTheDocument();
    expect(searchIcon.querySelector('svg')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Search by role, stack/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('renders custom triggers for Urgency, Notice Period, Experience, Location, and Sort By', () => {
    renderWithProviders(<BenchFilterBar totalCount={42} />);

    expect(screen.getByRole('button', { name: /select urgency/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select notice period/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select experience/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select location/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select sort by/i })).toBeInTheDocument();
  });

  it('opens Urgency dropdown on click and updates selection upon choosing an option', () => {
    const { store, container } = renderWithProviders(<BenchFilterBar totalCount={42} />);

    const urgencyTrigger = screen.getByRole('button', { name: /select urgency/i });
    expect(urgencyTrigger).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    fireEvent.click(urgencyTrigger);
    expect(urgencyTrigger).toHaveAttribute('aria-expanded', 'true');

    // Custom option item should be visible in the open menu
    const menuOptions = container.querySelectorAll('.BenchFilter-customOption');
    expect(menuOptions.length).toBeGreaterThan(0);

    const customOption = Array.from(menuOptions).find((el) =>
      el.textContent.includes('Immediate (24-48h)')
    );
    expect(customOption).toBeTruthy();

    // Click option
    fireEvent.click(customOption);

    // Dropdown closes and state is updated
    expect(urgencyTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(store.getState().bench.activeUrgency).toBe('Immediate (24-48h)');
  });

  it('closes open dropdown when pressing Escape key', () => {
    renderWithProviders(<BenchFilterBar totalCount={42} />);

    const sortTrigger = screen.getByRole('button', { name: /select sort by/i });
    fireEvent.click(sortTrigger);
    expect(sortTrigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sortTrigger).toHaveAttribute('aria-expanded', 'false');
  });
});
