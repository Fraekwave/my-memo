import type { MouseEvent, TouchEvent } from 'react';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type MouseSensorOptions,
  type TouchSensorOptions,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Task } from '@/lib/types';
import { TaskItem } from './TaskItem';

// ──────────────────────────────────────────────
// Interactive Element Filter
// ──────────────────────────────────────────────
// 이벤트 대상이 Checkbox, Button, Input 등 인터랙티브 요소이면
// 드래그를 활성화하지 않습니다. DOM 트리를 올라가며 확인합니다.
function isInteractiveElement(element: HTMLElement | null): boolean {
  const interactiveTags = new Set(['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'LABEL']);
  let cur = element;
  while (cur) {
    if (interactiveTags.has(cur.tagName)) return true;
    if (cur.dataset?.noDnd === 'true') return true;
    cur = cur.parentElement;
  }
  return false;
}

// ──────────────────────────────────────────────
// Custom Sensors: Interactive Element를 무시
// ──────────────────────────────────────────────
// MouseSensor/TouchSensor를 확장하여 activator handler에서
// 인터랙티브 요소 클릭/터치 시 드래그를 차단합니다.

class SmartMouseSensor extends MouseSensor {
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

class SmartTouchSensor extends TouchSensor {
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

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: number, isCompleted: boolean) => void;
  onUpdate: (id: number, newText: string) => void;
  onDelete: (id: number) => void;
  onReorder: (activeId: number, overId: number) => void;
}

/**
 * Task 목록 컴포넌트
 *
 * ✨ Drag & Drop 순서 변경 (Whole-Body Drag):
 * - 전체 Task 아이템 영역이 드래그 대상
 * - Mouse: distance 10px (클릭과 구분)
 * - Touch: delay 250ms + tolerance 5px (스크롤과 구분 — Long Press)
 * - SmartSensor: Checkbox, Button, Input 위의 이벤트는 드래그 차단
 */
export const TaskList = ({ tasks, onToggle, onUpdate, onDelete, onReorder }: TaskListProps) => {
  const sensors = useSensors(
    useSensor(SmartMouseSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(SmartTouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(Number(active.id), Number(over.id));
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 font-light">할 일이 없습니다</p>
          <p className="text-zinc-300 text-sm mt-1">새로운 태스크를 추가해보세요</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={onToggle}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
