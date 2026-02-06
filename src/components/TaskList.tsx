import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Task } from '@/lib/types';
import { TaskItem } from './TaskItem';

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
 * ✨ Drag & Drop 순서 변경:
 * - @dnd-kit의 verticalListSortingStrategy 사용
 * - PointerSensor (distance: 5px) — 핸들 기반이므로 복잡한 센서 분리 불필요
 * - 각 TaskItem이 자체적으로 useSortable + GripVertical 핸들 보유
 *
 * 빈 상태(Empty State) 처리 포함
 */
export const TaskList = ({ tasks, onToggle, onUpdate, onDelete, onReorder }: TaskListProps) => {
  // PointerSensor: 핸들에만 바인딩되므로 distance 5px만으로 충분
  // (Mouse & Touch 모두 Pointer Events API로 처리)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
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
