/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { SerializedDrawing } from './serialize'

/**
 * Undo model — committed operations only.
 *
 * A command is pushed at COMMIT boundaries (drawEnd for creates, editEnd
 * for drag gestures, close for edit sessions, apply for programmatic ops)
 * — never per 'progress' event. Ghost/synced/armed overlays never create
 * commands (the manager filters before calling push).
 */
export type UndoCommand =
  | { kind: 'create', snapshot: SerializedDrawing }
  | { kind: 'remove', snapshot: SerializedDrawing }
  | { kind: 'update', id: string, before: SerializedDrawing, after: SerializedDrawing }
  | { kind: 'batch', commands: UndoCommand[] }

/**
 * Operations the manager applies to the chart to perform an undo/redo.
 * `remove` = overlay ids to removeOverlay; `restore` = full before-images
 * to recreate (deleted) or revert (modified) via createOverlay/override.
 */
export interface UndoApply {
  remove: string[]
  restore: SerializedDrawing[]
  /**
   * Ordered sub-applies for 'batch' commands — present INSTEAD of
   * remove/restore contents on a batch. Applying remove-then-restore per
   * element preserves intra-batch ordering (a flat merge can't express
   * "restore X, then remove X" for create→remove same-id sequences).
   */
  ops?: UndoApply[]
}

const DEFAULT_MAX_HISTORY = 100

/** Consecutive updates to the same overlay within this window merge into one command. */
const UPDATE_MERGE_MS = 500

export interface DrawingHistory {
  push: (cmd: UndoCommand) => void
  /** Record a style/update; merges with a pending same-id update inside the merge window. */
  pushUpdate: (id: string, before: SerializedDrawing, after: SerializedDrawing) => void
  undo: () => UndoApply | null
  redo: () => UndoApply | null
  canUndo: () => boolean
  canRedo: () => boolean
  /**
   * Coalesce every push inside a begin/end window into one undoable
   * gesture — bulk removes (Remove All) undo as a single step.
   * endBatch is idempotent; nested begins collapse into the outer batch.
   */
  beginBatch: () => void
  endBatch: () => void
  /** Drop every command referencing the id — a remote remove must not let undo resurrect it. */
  invalidateOverlay: (id: string) => void
  clear: () => void
  readonly size: number
}

export function createDrawingHistory (options?: { maxHistory?: number }): DrawingHistory {
  const max = options?.maxHistory ?? DEFAULT_MAX_HISTORY
  let undoStack: UndoCommand[] = []
  let redoStack: UndoCommand[] = []
  let batchDepth = 0
  let pendingBatch: UndoCommand[] | null = null

  function applyOf (cmd: UndoCommand, direction: 'undo' | 'redo'): UndoApply {
    switch (cmd.kind) {
      case 'create':
        return direction === 'undo'
          ? { remove: [cmd.snapshot.id], restore: [] }
          : { remove: [], restore: [cmd.snapshot] }
      case 'remove':
        return direction === 'undo'
          ? { remove: [], restore: [cmd.snapshot] }
          : { remove: [cmd.snapshot.id], restore: [] }
      case 'update': {
        const snapshot = direction === 'undo' ? cmd.before : cmd.after
        return { remove: [], restore: [snapshot] }
      }
      case 'batch': {
        // Ordered per-child applies — undo unwinds children in reverse,
        // redo replays forward. Flattening into one remove/restore pair
        // would lose ordering for same-id create→remove sequences (zombie
        // resurrect on undo).
        const ordered = direction === 'undo' ? [...cmd.commands].reverse() : cmd.commands
        const ops: UndoApply[] = []
        for (const child of ordered) {
          ops.push(applyOf(child, direction))
        }
        return { remove: [], restore: [], ops }
      }
    }
  }

  return {
    get size () {
      return undoStack.length
    },

    push (cmd: UndoCommand): void {
      if (batchDepth > 0) {
        ;(pendingBatch ??= []).push(cmd)
        redoStack = []
        return
      }
      undoStack.push(cmd)
      if (undoStack.length > max) {
        undoStack.splice(0, undoStack.length - max)
      }
      // Any new local commit invalidates the redo lane.
      redoStack = []
    },

    pushUpdate (id: string, before: SerializedDrawing, after: SerializedDrawing): void {
      if (batchDepth > 0) {
        ;(pendingBatch ??= []).push({ kind: 'update', id, before, after })
        redoStack = []
        return
      }
      const top = undoStack.length > 0 ? undoStack[undoStack.length - 1] : undefined
      if (
        top !== undefined &&
        top.kind === 'update' &&
        top.id === id &&
        after.updatedAt - top.after.updatedAt <= UPDATE_MERGE_MS
      ) {
        // Merge — keep the EARLIEST before-image and the LATEST after-image.
        top.after = after
        redoStack = []
        return
      }
      undoStack.push({ kind: 'update', id, before, after })
      if (undoStack.length > max) {
        undoStack.splice(0, undoStack.length - max)
      }
      redoStack = []
    },

    undo (): UndoApply | null {
      const cmd = undoStack.pop()
      if (cmd === undefined) {
        return null
      }
      redoStack.push(cmd)
      return applyOf(cmd, 'undo')
    },

    redo (): UndoApply | null {
      const cmd = redoStack.pop()
      if (cmd === undefined) {
        return null
      }
      undoStack.push(cmd)
      return applyOf(cmd, 'redo')
    },

    canUndo (): boolean {
      return undoStack.length > 0
    },

    canRedo (): boolean {
      return redoStack.length > 0
    },

    beginBatch (): void {
      batchDepth += 1
      pendingBatch ??= []
    },

    endBatch (): void {
      if (batchDepth === 0) {
        return
      }
      batchDepth -= 1
      if (batchDepth > 0) {
        return
      }
      const collected = pendingBatch
      pendingBatch = null
      if (collected === null || collected.length === 0) {
        return
      }
      // Single-command batches stay a plain command — undo reads identical.
      undoStack.push(collected.length === 1 ? collected[0] : { kind: 'batch', commands: collected })
      if (undoStack.length > max) {
        undoStack.splice(0, undoStack.length - max)
      }
      redoStack = []
    },

    invalidateOverlay (id: string): void {
      const keep = (cmd: UndoCommand): boolean => {
        switch (cmd.kind) {
          case 'create':
          case 'remove':
            return cmd.snapshot.id !== id
          case 'update':
            return cmd.id !== id
          case 'batch': {
            cmd.commands = cmd.commands.filter(keep)
            // An emptied batch is dead weight — drop it outright.
            return cmd.commands.length > 0
          }
        }
      }
      undoStack = undoStack.filter(keep)
      redoStack = redoStack.filter(keep)
      pendingBatch = pendingBatch?.filter(keep) ?? null
    },

    clear (): void {
      undoStack = []
      redoStack = []
      batchDepth = 0
      pendingBatch = null
    }
  }
}
