import { useState, type MouseEvent, type TouchEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  closestCorners,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Modifier,
  type CollisionDetection,
  type MouseSensorOptions,
  type TouchSensorOptions,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Task } from '@/lib/types';
import { TaskItem } from './TaskItem';

// ──────────────────────────────────────────────
// Vertical Axis Restriction
// ──────────────────────────────────────────────
// 드래그를 Y축(상하)으로만 제한합니다. (@dnd-kit/modifiers 없이 인라인 구현)
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

// ──────────────────────────────────────────────
// Hybrid Collision Detection (Variable-Height + Gaps)
// ──────────────────────────────────────────────
// 가변 높이 아이템 + 12px 갭 환경에서 안정적인 드래그를 위한 복합 충돌 감지.
//
// 1차: pointerWithin — 포인터가 아이템 위에 있을 때 정밀 타겟팅
// 2차: closestCorners — 포인터가 갭(빈 공간)에 있을 때 가장 가까운 이웃 반환
//
// MeasuringStrategy.Always와 함께 사용하여 실시간 좌표 정확성 보장.
// hybridCollision은 포인터 기반이므로 Always에서도 피드백 루프가 발생하지 않음.
const hybridCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return closestCorners(args);
};

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
  // DragOverlay용: 현재 드래그 중인 Task ID 추적
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeTask = activeId !== null ? tasks.find((t) => t.id === activeId) : null;

  const sensors = useSensors(
    useSensor(SmartMouseSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(SmartTouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(Number(active.id), Number(over.id));
    }
    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
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
      collisionDetection={hybridCollision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
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

      {/* DragOverlay: 드래그 중 포인터를 따라다니는 플로팅 복사본 */}
      {/* React Portal로 렌더링되어 리스트 DOM 플로우와 완전히 분리됨 */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="task-item flex items-center gap-3 p-4 bg-white rounded-xl border border-zinc-200 shadow-xl select-none cursor-grabbing">
            <input
              type="checkbox"
              className="task-checkbox"
              checked={activeTask.is_completed}
              readOnly
            />
            <div className="flex-1 min-w-0">
              <span
                className={`block text-zinc-900 select-none ${
                  activeTask.is_completed ? 'completed' : ''
                }`}
              >
                {activeTask.text}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
