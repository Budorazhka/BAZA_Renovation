/** @vitest-environment jsdom */
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { AddressAutocomplete } from '../src/features/publishing/components/AddressAutocomplete'

describe('AddressAutocomplete', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders input with initial value and placeholder', () => {
    const handleChange = vi.fn()
    const handleSelect = vi.fn()

    render(
      <AddressAutocomplete
        value="Rustaveli"
        onChange={handleChange}
        onSelect={handleSelect}
        placeholder="Улица"
      />,
    )

    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('Rustaveli')
    expect(input.getAttribute('placeholder')).toBe('Улица')
  })

  it('triggers suggestions fetch and select on user input with coordinates preservation', async () => {
    const mockResponse = {
      features: [
        {
          properties: {
            street: 'Rustaveli Street',
            housenumber: '15',
            city: 'Batumi',
            country: 'Georgia',
          },
          geometry: {
            coordinates: [41.6367, 41.6434],
          },
        },
      ],
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const handleChange = vi.fn()
    const handleSelect = vi.fn()

    render(
      <AddressAutocomplete
        value=""
        onChange={handleChange}
        onSelect={handleSelect}
        cityContext="Batumi"
      />,
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Rustaveli' } })

    expect(handleChange).toHaveBeenCalledWith('Rustaveli')

    // Advance debounce timer
    vi.advanceTimersByTime(350)

    await vi.waitFor(() => {
      expect(screen.getByRole('listbox')).not.toBeNull()
    })

    const option = screen.getByRole('option')
    expect(option.textContent).toContain('Rustaveli Street 15')
    expect(option.textContent).toContain('Batumi, Georgia')

    fireEvent.click(option)

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        formattedAddress: 'Rustaveli Street 15',
        city: 'Batumi',
        coordinates: [41.6367, 41.6434],
      }),
    )
    expect(handleChange).toHaveBeenCalledWith('Rustaveli Street 15')
  })

  it('prevents race conditions: stale slower response for previous query is ignored', async () => {
    let resolveFirstQuery: (val: any) => void = () => {}
    let resolveSecondQuery: (val: any) => void = () => {}

    const firstPromise = new Promise((resolve) => {
      resolveFirstQuery = resolve
    })
    const secondPromise = new Promise((resolve) => {
      resolveSecondQuery = resolve
    })

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('OldQuery')) {
        return firstPromise
      }
      return secondPromise
    })
    global.fetch = fetchMock

    const handleChange = vi.fn()
    const handleSelect = vi.fn()

    render(
      <AddressAutocomplete
        value=""
        onChange={handleChange}
        onSelect={handleSelect}
        cityContext="Batumi"
      />,
    )

    const input = screen.getByRole('textbox')

    // First input change
    fireEvent.change(input, { target: { value: 'OldQuery' } })
    vi.advanceTimersByTime(350)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Second input change before first responds
    fireEvent.change(input, { target: { value: 'NewQuery' } })
    vi.advanceTimersByTime(350)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Now second query (NewQuery) resolves FIRST
    resolveSecondQuery({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: { street: 'New Street 100', city: 'Batumi', country: 'Georgia' },
            geometry: { coordinates: [41.7, 41.7] },
          },
        ],
      }),
    })

    await vi.waitFor(() => {
      expect(screen.getByRole('option').textContent).toContain('New Street 100')
    })

    // Now first query (OldQuery) resolves AFTERWARDS (stale response)
    resolveFirstQuery({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: { street: 'Old Stale Street', city: 'Batumi', country: 'Georgia' },
            geometry: { coordinates: [40.0, 40.0] },
          },
        ],
      }),
    })

    // Advance any timers
    vi.advanceTimersByTime(100)

    // Verify that the dropdown STILL shows the fresh New Street 100, NOT Old Stale Street
    const options = screen.getAllByRole('option')
    expect(options.length).toBe(1)
    expect(options[0]!.textContent).toContain('New Street 100')
    expect(options[0]!.textContent).not.toContain('Old Stale Street')
  })

  it('handles keyboard navigation: ArrowDown, ArrowUp, Enter to select and Escape to dismiss', async () => {
    const mockResponse = {
      features: [
        {
          properties: { street: 'First Street 1', city: 'Batumi', country: 'Georgia' },
          geometry: { coordinates: [41.61, 41.61] },
        },
        {
          properties: { street: 'Second Street 2', city: 'Batumi', country: 'Georgia' },
          geometry: { coordinates: [41.62, 41.62] },
        },
      ],
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const handleChange = vi.fn()
    const handleSelect = vi.fn()

    render(
      <AddressAutocomplete
        value=""
        onChange={handleChange}
        onSelect={handleSelect}
        cityContext="Batumi"
      />,
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Chavchavadze' } })
    vi.advanceTimersByTime(350)

    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2)
    })

    const options = screen.getAllByRole('option')

    // Navigate down to first option
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options[0]!.getAttribute('aria-selected')).toBe('true')
    expect(options[1]!.getAttribute('aria-selected')).toBe('false')

    // Navigate down to second option
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options[0]!.getAttribute('aria-selected')).toBe('false')
    expect(options[1]!.getAttribute('aria-selected')).toBe('true')

    // Navigate up back to first option
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(options[0]!.getAttribute('aria-selected')).toBe('true')

    // Press Enter to select the active first option
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        formattedAddress: 'First Street 1',
        coordinates: [41.61, 41.61],
      }),
    )

    // After selection, dropdown closes
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('handles Escape key to close the suggestions dropdown', async () => {
    const mockResponse = {
      features: [
        {
          properties: { street: 'Gorgiladze 25', city: 'Batumi', country: 'Georgia' },
          geometry: { coordinates: [41.63, 41.63] },
        },
      ],
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    render(
      <AddressAutocomplete
        value=""
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Gorgiladze' } })
    vi.advanceTimersByTime(350)

    await vi.waitFor(() => {
      expect(screen.getByRole('listbox')).not.toBeNull()
    })

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('graceful failure when geocoder is unreachable / network offline: manual typing is never blocked', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline or Photon unreachable'))

    const handleChange = vi.fn()
    const handleSelect = vi.fn()

    render(
      <AddressAutocomplete
        value=""
        onChange={handleChange}
        onSelect={handleSelect}
      />,
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Manual Typed Address 42' } })
    vi.advanceTimersByTime(350)

    // Value change fired correctly
    expect(handleChange).toHaveBeenCalledWith('Manual Typed Address 42')

    // Dropdown is not shown on error
    expect(screen.queryByRole('listbox')).toBeNull()
    // No unhandled error thrown, input continues to function
  })
})
