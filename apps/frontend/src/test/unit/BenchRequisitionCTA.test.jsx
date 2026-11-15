import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import BenchRequisitionCTA from '../../components/BenchComponents/BenchRequisitionCTA';
import BenchDossierFeatures from '../../components/BenchComponents/BenchDossierFeatures';

describe('BenchDossierFeatures Component', () => {
  it('renders all 4 dossier cards with reveal wrappers and full card heights', () => {
    const { container } = renderWithProviders(<BenchDossierFeatures />);

    const cards = container.querySelectorAll('.BenchDossierFeatures-card');
    expect(cards.length).toBe(4);

    const reveals = container.querySelectorAll('.BenchDossierFeatures-reveal');
    expect(reveals.length).toBe(4);

    // Verify card titles from Redux state
    expect(screen.getByText(/Real PR & GitHub Audit/i)).toBeInTheDocument();
    expect(screen.getByText(/Architect Rubric Scorecard/i)).toBeInTheDocument();
    expect(screen.getByText(/4-Min Technical Video Intro/i)).toBeInTheDocument();
    expect(screen.getByText(/Pre-Cleared EOR Compliance/i)).toBeInTheDocument();
  });
});

describe('BenchRequisitionCTA Component & Custom Dropdowns', () => {
  it('renders Highlight Your Demand section and 3 stat cards', () => {
    renderWithProviders(<BenchRequisitionCTA />);

    expect(screen.getByText(/Highlight Your Demand/i)).toBeInTheDocument();
    expect(screen.getByText('5 Days')).toBeInTheDocument();
    expect(screen.getByText('Custom Pod Delivery SLA')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('IP Ownership from Day 1')).toBeInTheDocument();
    expect(screen.getByText('< 5h')).toBeInTheDocument();
    expect(screen.getByText('Director Intake Calibration')).toBeInTheDocument();
  });

  it('renders custom triggers for Experience Range, Domain, and Target Notice Period', () => {
    renderWithProviders(<BenchRequisitionCTA />);

    expect(
      screen.getByRole('button', { name: /select experience range/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /select domain/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /select target notice period/i })
    ).toBeInTheDocument();
  });

  it('opens Experience Range dropdown on click and updates selection upon choosing an option', () => {
    const { container } = renderWithProviders(<BenchRequisitionCTA />);

    const expTrigger = screen.getByRole('button', {
      name: /select experience range/i,
    });
    expect(expTrigger).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    fireEvent.click(expTrigger);
    expect(expTrigger).toHaveAttribute('aria-expanded', 'true');

    // Options should appear in floating menu
    const menuOptions = container.querySelectorAll(
      '.BenchRequisition-customOption'
    );
    expect(menuOptions.length).toBeGreaterThan(0);

    const option5to8 = Array.from(menuOptions).find((el) =>
      el.textContent.includes('5–8 years')
    );
    expect(option5to8).toBeTruthy();

    fireEvent.click(option5to8);

    // Dropdown closes and trigger text updates
    expect(expTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(expTrigger.textContent).toContain('5–8 years');
  });

  it('reveals custom domain input when selecting Other in Domain dropdown', () => {
    const { container } = renderWithProviders(<BenchRequisitionCTA />);

    const domainTrigger = screen.getByRole('button', {
      name: /select domain/i,
    });
    fireEvent.click(domainTrigger);

    const menuOptions = container.querySelectorAll(
      '.BenchRequisition-customOption'
    );
    const optionOther = Array.from(menuOptions).find((el) =>
      el.textContent.trim() === 'Other'
    );
    expect(optionOther).toBeTruthy();

    fireEvent.click(optionOther);

    expect(
      screen.getByLabelText(/Specify Other Domain/i)
    ).toBeInTheDocument();
  });

  it('closes open dropdown when pressing Escape key', () => {
    renderWithProviders(<BenchRequisitionCTA />);

    const noticeTrigger = screen.getByRole('button', {
      name: /select target notice period/i,
    });
    fireEvent.click(noticeTrigger);
    expect(noticeTrigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(noticeTrigger).toHaveAttribute('aria-expanded', 'false');
  });
});
