import { type MouseEvent, type TouchEvent } from 'react';
import {
  MouseSensor,
  TouchSensor,
  type Modifier,
  type CollisionDetection,
  type MouseSensorOptions,
  type TouchSensorOptions,
} from '@dnd-kit/core';

// Vertical Axis Restriction
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

// Pure Pointer-Y Collision Detection
export const pointerTrackingCollision: CollisionDetection = (args) => {
  const { pointerCoordinates, droppableRects, droppableContainers } = args;
  if (!pointerCoordinates) return [];

  const pointerY = pointerCoordinates.y;
  let closestId: string | number | null = null;
  let closestDistance = Infinity;

  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(pointerY - centerY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestId = container.id;
    }
  }

  return closestId !== null ? [{ id: closestId }] : [];
};

// Interactive Element Filter
export function isInteractiveElement(element: HTMLElement | null): boolean {
  const interactiveTags = new Set(['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'LABEL']);
  let cur = element;
  while (cur) {
    if (interactiveTags.has(cur.tagName)) return true;
    if (cur.dataset?.noDnd === 'true') return true;
    cur = cur.parentElement;
  }
  return false;
}

// Custom Sensors: skip interactive elements
export class SmartMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: 'onMouseDown' as const,
      handler: (
        { nativeEvent: event }: MouseEvent,
        { onActivation }: MouseSensorOptions
      ) => {
        if (isInteractiveElement(event.target as HTMLElement)) return false;
        return MouseSensor.activators[0].handler(
          { nativeEvent: event } as unknown as MouseEvent,
          { onActivation } as MouseSensorOptions
        );
      },
    },
  ];
}

export class SmartTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: (
        { nativeEvent: event }: TouchEvent,
        { onActivation }: TouchSensorOptions
      ) => {
        if (isInteractiveElement(event.target as HTMLElement)) return false;
        return TouchSensor.activators[0].handler(
          { nativeEvent: event } as unknown as TouchEvent,
          { onActivation } as TouchSensorOptions
        );
      },
    },
  ];
}
