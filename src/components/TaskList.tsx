import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Task } from '@/lib/types';
import { getTaskAgingStyles } from '@/lib/visualAging';
import { TaskItem } from './TaskItem';
import {
  restrictToVerticalAxis,
  pointerTrackingCollision,
  SmartMouseSensor,
  SmartTouchSensor,
} from '@/lib/dndUtils';

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: number, isCompleted: boolean) => void;
  onUpdate: (id: number, newText: string) => void;
  onDelete: (id: number) => void;
  onReorder: (activeId: number, overId: number) => void;
  disableReorder?: boolean;
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
export const TaskList = ({ tasks, onToggle, onUpdate, onDelete, onReorder, disableReorder = false }: TaskListProps) => {
  const { t } = useTranslation();
  // DragOverlay용: 현재 드래그 중인 Task ID 추적
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeTask = activeId !== null ? tasks.find((t) => t.id === activeId) : null;

  const mouseOptions = useMemo(() => ({ activationConstraint: { distance: 10 } }), []);
  const touchOptions = useMemo(() => ({ activationConstraint: { delay: 250, tolerance: 5 } }), []);
  const sensors = useSensors(
    useSensor(SmartMouseSensor, mouseOptions),
    useSensor(SmartTouchSensor, touchOptions)
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
    (document.activeElement as HTMLElement)?.blur?.();
  };

  const handleDragCancel = () => {
    setActiveId(null);
    (document.activeElement as HTMLElement)?.blur?.();
  };

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-stone-400 font-light">{t('tasks.noTask')}</p>
          <p className="text-stone-300 text-sm mt-1">{t('tasks.noTaskSub')}</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerTrackingCollision}
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
              activeDragId={activeId}
              onToggle={onToggle}
              onUpdate={onUpdate}
              onDelete={onDelete}
              disableDrag={disableReorder}
            />
          ))}
        </div>
      </SortableContext>

      {/* DragOverlay: 드래그 중 포인터를 따라다니는 플로팅 복사본 */}
      {/* React Portal로 렌더링되어 리스트 DOM 플로우와 완전히 분리됨 */}
      {/* Visual Aging: TaskItem과 동일한 배경/텍스트 스타일 적용 */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (() => {
          const aging = getTaskAgingStyles(activeTask.created_at);
          return (
            <div
              className="task-item flex items-center gap-3 p-4 rounded-xl border border-stone-200 shadow-xl select-none cursor-grabbing"
              style={{ backgroundColor: aging.backgroundColor }}
            >
              <input
                type="checkbox"
                className="task-checkbox"
                checked={activeTask.is_completed}
                readOnly
              />
              <div className="flex-1 min-w-0">
                <span
                  className={`block select-none ${activeTask.is_completed ? 'completed' : ''}`}
                  style={{ color: aging.textColor }}
                >
                  {activeTask.text}
                </span>
              </div>
            </div>
          );
        })() : null}
      </DragOverlay>
    </DndContext>
  );
};
