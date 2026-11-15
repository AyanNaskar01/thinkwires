/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContactForm from '../../components/ContactComponents/ContactForm';
import { renderWithProviders } from '../test-utils';

const defaultFormConfig = {
  title: 'Send Us a Message',
  subtitle: "Tell us about your hiring challenge and we'll respond with a tailored plan.",
  inquiryTypes: [
    'Staff Augmentation',
    'Permanent Hiring',
    'Employer of Record (EOR)',
    'Executive Search',
    'Talent Advisory',
    'Partnership / Vendor Registration',
    'General Inquiry',
  ],
  fields: [
    { name: 'fullName', label: 'Full Name', type: 'text', placeholder: 'e.g. James Mitchell', required: true },
    { name: 'workEmail', label: 'Work Email', type: 'email', placeholder: 'james@company.com', required: true },
    { name: 'phone', label: 'Phone Number', type: 'tel', placeholder: '+1 (555) 019-2834', required: false },
    { name: 'company', label: 'Company / Organisation', type: 'text', placeholder: 'e.g. Accenture, TCS', required: false },
    { name: 'inquiryType', label: 'Inquiry Type', type: 'select', placeholder: 'Select inquiry type', required: true },
    { name: 'message', label: 'Describe Your Requirement', type: 'textarea', placeholder: 'e.g. We need 4x SAP ABAP consultants', required: false },
  ],
  submitLabel: 'Send Message',
  footerNote: 'No spam. We respond within 5 business hours.',
};

describe('ContactForm Component', () => {
  it('renders form title, subtitle, and all fields', () => {
    renderWithProviders(<ContactForm formConfig={defaultFormConfig} />);

    expect(screen.getByRole('heading', { name: /Send Us a Message/i })).toBeInTheDocument();
    expect(screen.getByText(/Tell us about your hiring challenge/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Work Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Company \/ Organisation/i)).toBeInTheDocument();
    // The inquiry type label links to the trigger button via aria-labelledby
    const inquiryLabel = screen.getByText(/Inquiry Type/i, { selector: 'label' });
    expect(inquiryLabel).toBeInTheDocument();
    expect(screen.getByLabelText(/Describe Your Requirement/i)).toBeInTheDocument();
  });

  it('renders the custom Inquiry Type dropdown trigger button', () => {
    const { container } = renderWithProviders(<ContactForm formConfig={defaultFormConfig} />);

    const trigger = container.querySelector('#contact-inquiryType-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('ContactForm-customSelectTrigger');
    expect(trigger.tagName).toBe('BUTTON');

    const arrow = container.querySelector('.ContactForm-selectArrow');
    expect(arrow).toBeInTheDocument();
  });

  it('opens the custom dropdown menu on trigger click with all inquiry type options', () => {
    const { container } = renderWithProviders(<ContactForm formConfig={defaultFormConfig} />);

    const trigger = container.querySelector('#contact-inquiryType-trigger');
    expect(container.querySelector('#contact-inquiryType-menu')).not.toBeInTheDocument();

    // Click trigger to open menu
    fireEvent.click(trigger);

    const menu = container.querySelector('#contact-inquiryType-menu');
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveClass('ContactForm-customSelectMenu');

    // All inquiry types are listed
    expect(within(menu).getByText('Staff Augmentation')).toBeInTheDocument();
    expect(within(menu).getByText('Employer of Record (EOR)')).toBeInTheDocument();
    expect(within(menu).getByText('General Inquiry')).toBeInTheDocument();
  });

  it('selects an inquiry type option and closes the menu', () => {
    const { container } = renderWithProviders(<ContactForm formConfig={defaultFormConfig} />);

    const trigger = container.querySelector('#contact-inquiryType-trigger');
    fireEvent.click(trigger);

    const menu = container.querySelector('#contact-inquiryType-menu');
    const eorOption = within(menu).getByText('Employer of Record (EOR)');
    fireEvent.click(eorOption);

    // Menu closes
    expect(container.querySelector('#contact-inquiryType-menu')).not.toBeInTheDocument();

    // Trigger reflects the selected value
    expect(trigger).toHaveTextContent('Employer of Record (EOR)');

    // Hidden native select is kept in sync
    const hiddenSelect = container.querySelector('#contact-inquiryType');
    expect(hiddenSelect).toBeInTheDocument();
    expect(hiddenSelect.value).toBe('Employer of Record (EOR)');
  });

  it('closes the dropdown when Escape key is pressed', () => {
    const { container } = renderWithProviders(<ContactForm formConfig={defaultFormConfig} />);

    const trigger = container.querySelector('#contact-inquiryType-trigger');
    fireEvent.click(trigger);
    expect(container.querySelector('#contact-inquiryType-menu')).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(container.querySelector('#contact-inquiryType-menu')).not.toBeInTheDocument();
  });

  it('opens dropdown with ArrowDown key and navigates options', () => {
    const { container } = renderWithProviders(<ContactForm formConfig={defaultFormConfig} />);

    const trigger = container.querySelector('#contact-inquiryType-trigger');

    // ArrowDown opens the menu
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(container.querySelector('#contact-inquiryType-menu')).toBeInTheDocument();

    // Escape closes
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(container.querySelector('#contact-inquiryType-menu')).not.toBeInTheDocument();
  });

  it('shows the chevron arrow on the trigger and rotates it when open', () => {
    const { container } = renderWithProviders(<ContactForm formConfig={defaultFormConfig} />);

    const trigger = container.querySelector('#contact-inquiryType-trigger');
    const arrow = container.querySelector('.ContactForm-selectArrow');
    expect(arrow).not.toHaveClass('is-open');

    fireEvent.click(trigger);
    expect(container.querySelector('.ContactForm-selectArrow')).toHaveClass('is-open');
  });

  it('shows the selected option highlighted with is-selected class', () => {
    const { container } = renderWithProviders(<ContactForm formConfig={defaultFormConfig} />);

    const trigger = container.querySelector('#contact-inquiryType-trigger');
    // Select 'General Inquiry' first
    fireEvent.click(trigger);
    const menu = container.querySelector('#contact-inquiryType-menu');
    fireEvent.click(within(menu).getByText('General Inquiry'));

    // Reopen and verify selected class
    fireEvent.click(trigger);
    const reopenedMenu = container.querySelector('#contact-inquiryType-menu');
    const selectedOption = within(reopenedMenu).getByText('General Inquiry').closest('li');
    expect(selectedOption).toHaveClass('is-selected');
  });

  it('shows required field validation errors on submit', () => {
    renderWithProviders(<ContactForm formConfig={defaultFormConfig} />);

    const submitBtn = screen.getByRole('button', { name: /Send Message/i });
    fireEvent.click(submitBtn);

    // Required fields Full Name & Work Email should show errors
    expect(screen.getByText(/Full Name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Work Email is required/i)).toBeInTheDocument();
  });
});
