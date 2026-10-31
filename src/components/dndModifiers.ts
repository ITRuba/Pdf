import type { Modifier } from '@dnd-kit/core';

// Small local versions of @dnd-kit/modifiers to avoid an extra dependency.

export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export const restrictToParentElement: Modifier = ({ transform, draggingNodeRect, containerNodeRect }) => {
  if (!draggingNodeRect || !containerNodeRect) return transform;
  const minY = containerNodeRect.top - draggingNodeRect.top;
  const maxY = containerNodeRect.bottom - draggingNodeRect.bottom;
  return { ...transform, y: Math.min(maxY, Math.max(minY, transform.y)) };
};
