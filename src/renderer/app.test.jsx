import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('renderer scaffold', () => {
  it('renders the app shell', () => {
    render(<h1>Igriss</h1>)
    expect(screen.getByRole('heading', { name: 'Igriss' })).toBeInTheDocument()
  })
})
