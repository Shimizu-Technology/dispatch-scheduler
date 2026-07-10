type ImportDraftIdentity = {
  import_item_id?: number
}

export function mergeImportDrafts<T extends ImportDraftIdentity>(currentDrafts: T[], incomingDrafts: T[]) {
  const incomingIds = new Set(incomingDrafts.map((draft) => draft.import_item_id).filter((id) => id !== undefined))
  return [
    ...currentDrafts.filter((draft) => draft.import_item_id === undefined || !incomingIds.has(draft.import_item_id)),
    ...incomingDrafts,
  ]
}
