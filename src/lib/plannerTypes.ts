/** Contract between the app and the life-planner Edge Function. Shared shape, validated server-side with zod. */
export type ProposalOp = 'create_event' | 'move_event' | 'delete_event' | 'create_task' | 'update_task';

export interface ProposalItem {
  op: ProposalOp;
  ref_id?: string | null;        // existing event/task for move/delete/update
  title: string;
  starts_at?: string | null;     // ISO
  ends_at?: string | null;
  due_date?: string | null;      // yyyy-MM-dd for tasks
  activity_id?: string | null;
  task_id?: string | null;
  kind?: 'event' | 'activity' | 'break' | 'task_block' | 'focus' | 'routine';
  note?: string | null;          // what to accomplish in this session
  issues?: string[];             // validator findings (overlap, rest day…) — shown, never hidden
}

export interface PlannerResponse {
  reply: string;
  off_topic?: boolean;
  plan_id?: string | null;
  proposal?: { summary: string; items: ProposalItem[]; warnings: string[] } | null;
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
