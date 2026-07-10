import { describe, expect, it } from 'vitest'
import { mergeImportDrafts } from './importDrafts'

describe('mergeImportDrafts', () => {
  it('preserves a preview created while the initial persisted-draft request was in flight', () => {
    const inFlightPreview = { import_item_id: 2, title: 'New preview' }
    const olderServerSnapshot = { import_item_id: 1, title: 'Persisted draft' }

    expect(mergeImportDrafts([inFlightPreview], [olderServerSnapshot])).toEqual([
      inFlightPreview,
      olderServerSnapshot,
    ])
  })

  it('replaces duplicate draft data with the latest incoming version', () => {
    expect(mergeImportDrafts(
      [ { import_item_id: 1, title: 'Old title' } ],
      [ { import_item_id: 1, title: 'Updated title' } ],
    )).toEqual([ { import_item_id: 1, title: 'Updated title' } ])
  })
})
