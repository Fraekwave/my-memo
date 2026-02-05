import { Task } from '@/lib/types';
import { TaskItem } from './TaskItem';

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: number, isCompleted: boolean) => void;
  onUpdate: (id: number, newText: string) => void;
  onDelete: (id: number) => void;
}

/**
 * Task 목록 컴포넌트
 * 
 * 빈 상태(Empty State) 처리 포함
 * 인라인 편집 기능 추가 (onUpdate prop)
 */
export const TaskList = ({ tasks, onToggle, onUpdate, onDelete }: TaskListProps) => {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400 font-light">할 일이 없습니다</p>
        <p className="text-zinc-300 text-sm mt-1">새로운 태스크를 추가해보세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto">
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
  );
};
