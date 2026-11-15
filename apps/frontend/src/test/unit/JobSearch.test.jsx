import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import JobSearch from '../../components/JobsComponents/JobSearch';

describe('JobSearch Component Custom Dropdowns & Search', () => {
  it('renders search input with magnifying glass icon and allows typing', () => {
    const setSearchQuery = vi.fn();
    const { container } = render(
      <JobSearch
        searchQuery="React"
        setSearchQuery={setSearchQuery}
        locationFilter="All"
        experienceFilter="All"
      />
    );

    const input = screen.getByLabelText(/Search by title or tech stack/i);
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('React');

    const icon = container.querySelector('.JobSearch-inputIcon');
    expect(icon).toBeInTheDocument();

    const clearBtn = screen.getByLabelText(/Clear search input/i);
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(setSearchQuery).toHaveBeenCalledWith('');
  });

  it('opens Location custom dropdown, displays active checkmark, and triggers selection', () => {
    const setLocationFilter = vi.fn();
    const { container } = render(
      <JobSearch
        searchQuery=""
        setSearchQuery={() => {}}
        locationFilter="India"
        setLocationFilter={setLocationFilter}
        experienceFilter="All"
        setExperienceFilter={() => {}}
      />
    );

    const trigger = screen.getByRole('button', { name: /Location filter: India/i });
    expect(trigger).toBeInTheDocument();

    // Click to open
    fireEvent.click(trigger);

    const menu = screen.getByRole('listbox', { name: /Filter jobs by location/i });
    expect(menu).toBeInTheDocument();

    const indiaOption = container.querySelector('#location-option-India');
    expect(indiaOption).toHaveClass('is-selected');

    // Click United States option
    const usOption = container.querySelector('#location-option-United\\ States');
    fireEvent.click(usOption);
    expect(setLocationFilter).toHaveBeenCalledWith('United States');
  });

  it('opens Experience custom dropdown and selects experience tier', () => {
    const setExperienceFilter = vi.fn();
    const { container } = render(
      <JobSearch
        searchQuery=""
        setSearchQuery={() => {}}
        locationFilter="All"
        setLocationFilter={() => {}}
        experienceFilter="Senior"
        setExperienceFilter={setExperienceFilter}
      />
    );

    const trigger = screen.getByRole('button', { name: /Experience filter: 5 - 8 Years \(Senior\)/i });
    expect(trigger).toBeInTheDocument();

    // Click to open
    fireEvent.click(trigger);

    const menu = screen.getByRole('listbox', { name: /Filter jobs by experience tier/i });
    expect(menu).toBeInTheDocument();

    const seniorOption = container.querySelector('#experience-option-Senior');
    expect(seniorOption).toHaveClass('is-selected');

    // Click Lead option
    const leadOption = container.querySelector('#experience-option-Lead');
    fireEvent.click(leadOption);
    expect(setExperienceFilter).toHaveBeenCalledWith('Lead');
  });

  it('opens Notice and Sort custom dropdowns and handles selection', () => {
    const setNoticePeriod = vi.fn();
    const setSortBy = vi.fn();
    render(
      <JobSearch
        searchQuery=""
        setSearchQuery={() => {}}
        locationFilter="All"
        setLocationFilter={() => {}}
        experienceFilter="All"
        setExperienceFilter={() => {}}
        noticePeriod="Immediate"
        setNoticePeriod={setNoticePeriod}
        sortBy="Newest First"
        setSortBy={setSortBy}
      />
    );

    // Notice dropdown
    const noticeTrigger = screen.getByRole('button', { name: /Notice period filter: Immediate/i });
    expect(noticeTrigger).toBeInTheDocument();
    fireEvent.click(noticeTrigger);

    const immediateOption = screen.getByRole('option', { name: /Immediate/i });
    expect(immediateOption).toHaveClass('is-selected');

    const less30Option = screen.getByRole('option', { name: /< 30 Days/i });
    fireEvent.click(less30Option);
    expect(setNoticePeriod).toHaveBeenCalledWith('< 30 Days');

    // Sort dropdown
    const sortTrigger = screen.getByRole('button', { name: /Sort jobs: Newest First/i });
    expect(sortTrigger).toBeInTheDocument();
    fireEvent.click(sortTrigger);

    const highestSalaryOption = screen.getByRole('option', { name: /Highest Salary/i });
    fireEvent.click(highestSalaryOption);
    expect(setSortBy).toHaveBeenCalledWith('Highest Salary');
  });

  it('closes dropdowns on click outside', () => {
    render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <JobSearch
          searchQuery=""
          setSearchQuery={() => {}}
          locationFilter="All"
          setLocationFilter={() => {}}
          experienceFilter="All"
          setExperienceFilter={() => {}}
        />
      </div>
    );

    const locationTrigger = screen.getByRole('button', { name: /Location filter:/i });
    fireEvent.click(locationTrigger);
    expect(screen.getByRole('listbox', { name: /Filter jobs by location/i })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside-element'));
    expect(screen.queryByRole('listbox', { name: /Filter jobs by location/i })).not.toBeInTheDocument();
  });
});
