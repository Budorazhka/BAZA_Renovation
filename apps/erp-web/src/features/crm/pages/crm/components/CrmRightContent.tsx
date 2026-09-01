import LeadsBlock from '../../../components/crm/LeadsBlock';
import TasksBlock from '../../../components/crm/TasksBlock';
import NotificationsBlock from '../../../components/crm/NotificationsBlock';
import type { Task, Lead } from '../../../services/api';
import type { TaskStatus } from '../../../services/api';
import { ProductType, LeadStage } from '../../../services/api';

export type ProductTab = 'RP' | 'Net' | 'Owner' | 'Agent';

export interface CrmRightContentProps {
  backendTasks: Task[];
  backendLeads: Lead[];
  lastUpdateTime: Date;
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onOpenNewTaskModal: () => void;
  onOpenTaskManagementModal: () => void;
  onTaskUpdate: (updatedTask: Task) => void;
  onUpdateTaskEndDate: (taskId: string, endDate: string | undefined) => Promise<void>;
  onOpenTaskView: (taskId: string) => void;
  onUpdateLeads: (leads: Lead[]) => void;
  onUpdateLead: (leadId: string, updates: Partial<Lead>, modifiedFields: string[]) => void;
  onUpdateLeadAfterSync: (leadId: string, syncedLead: Lead) => void;
  onLoadLeads: () => Promise<void>;
  onLeadStageChange: (leadId: string, leadName: string, stageLabel: string, stage: LeadStage, productType: ProductType) => void;
  onOpenNewTaskModalWithLead: (leadId: string) => void;
  activeLeadId?: string;
  onLeadDeleted: (leadId: string) => Promise<void>;
  onProductChange: (product: ProductTab) => void;
  onCloseChecklist: () => void;
}

const CrmRightContent = ({
  backendTasks,
  backendLeads,
  lastUpdateTime,
  onUpdateTaskStatus,
  onDeleteTask,
  onOpenNewTaskModal,
  onOpenTaskManagementModal,
  onTaskUpdate,
  onUpdateTaskEndDate,
  onOpenTaskView,
  onUpdateLeads,
  onUpdateLead,
  onUpdateLeadAfterSync,
  onLoadLeads,
  onLeadStageChange,
  onOpenNewTaskModalWithLead,
  activeLeadId,
  onLeadDeleted,
  onProductChange,
  onCloseChecklist,
}: CrmRightContentProps) => {
  return (
    <div className="flex flex-col w-full md:flex-1 min-w-0 crm-right-col">
      <div className="flex-col gap-x-5 gap-y-6 min-w-0 crm-inner-row hidden md:flex md:flex-wrap relative">
        <TasksBlock
          tasks={backendTasks}
          lastUpdateTime={lastUpdateTime}
          onUpdateTaskStatus={onUpdateTaskStatus}
          onDeleteTask={onDeleteTask}
          onOpenNewTaskModal={onOpenNewTaskModal}
          onOpenTaskManagementModal={onOpenTaskManagementModal}
          onTaskUpdate={onTaskUpdate}
          onUpdateTaskEndDate={onUpdateTaskEndDate}
          onOpenTaskView={onOpenTaskView}
        />
        <NotificationsBlock onOpenTaskView={onOpenTaskView} />
      </div>
      <div className="hidden md:block">
        <LeadsBlock
          backendLeads={backendLeads}
          onUpdateLeads={onUpdateLeads}
          onUpdateLead={onUpdateLead}
          onUpdateLeadAfterSync={onUpdateLeadAfterSync}
          onLoadLeads={onLoadLeads}
          onLeadStageChange={onLeadStageChange}
          onOpenNewTaskModal={onOpenNewTaskModalWithLead}
          onOpenTaskManagementModal={onOpenTaskManagementModal}
          activeLeadId={activeLeadId}
          onLeadDeleted={onLeadDeleted}
          onProductChange={onProductChange}
          onCloseChecklist={onCloseChecklist}
        />
      </div>
    </div>
  );
};

export default CrmRightContent;
