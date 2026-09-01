import React from 'react';
import NotesBlock from './NotesBlock';
import ReportsBlock from './ReportsBlock';
import TasksBlock from './TasksBlock';
import NotificationsBlock from './NotificationsBlock';
import LeadsBlock from './LeadsBlock';
import CalendarBlock from './CalendarBlock';
import LibrarySelectorBlock from './LibrarySelectorBlock';
import AskQuestionButton from './AskQuestionButton';
import { ProductType } from '../../services/api';
import type { Lead, Task, LeadStage } from '../../services/api';
import { useI18n } from "@/i18n";

interface LeftSidebarProps {
  onLogout: () => void;
  backendTasks: Task[];
  backendLeads: Lead[];
  lastUpdateTime: Date;
  selectedProductForLibrary: 'RP' | 'Net' | 'Owner' | 'Agent';
  setSelectedProductForLibrary: (product: 'RP' | 'Net' | 'Owner' | 'Agent') => void;
  leadStageOverlay: { leadId: string } | null;
  handleCloseOverlay: () => void;
  updateTaskStatus: (taskId: string, status: any) => Promise<void>;
  handleDeleteTask: (taskId: string) => Promise<void>;
  handleOpenNewTaskModal: () => void;
  handleOpenTaskManagementModal: () => void;
  handleTaskUpdate: (task: Task) => Promise<void>;
  updateTaskEndDate: (taskId: string, endDate: string | null | undefined) => Promise<void>;
  handleUpdateLeads: (leads: Lead[]) => void;
  handleUpdateLead: (leadId: string, updates: Partial<Lead>, modifiedFields: string[]) => void;
  handleUpdateLeadAfterSync: (leadId: string, syncedLead: Lead) => void;
  loadLeads: () => Promise<void>;
  handleLeadStageChange: (leadId: string, leadName: string, stageLabel: string, stage: LeadStage, productType: ProductType) => void;
  handleOpenNewTaskModalWithLead: (leadId: string) => void;
  handleLeadDeleted: () => void;
  setIsAskQuestionModalOpen: (open: boolean) => void;
  onOpenNewTaskModalFromNote?: (noteData: { title: string; description: string; leadId?: string; taskType?: 'standard' | 'call' | 'meeting'; noteId?: string; files?: Array<{ originalName: string; filename: string; mimeType: string; size: number; url?: string }> }) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  onLogout,
  backendTasks,
  backendLeads,
  lastUpdateTime,
  selectedProductForLibrary,
  setSelectedProductForLibrary,
  leadStageOverlay,
  handleCloseOverlay,
  updateTaskStatus,
  handleDeleteTask,
  handleOpenNewTaskModal,
  handleOpenTaskManagementModal,
  handleTaskUpdate,
  updateTaskEndDate,
  handleUpdateLeads,
  handleUpdateLead,
  handleUpdateLeadAfterSync,
  loadLeads,
  handleLeadStageChange,
  handleOpenNewTaskModalWithLead,
  handleLeadDeleted,
  setIsAskQuestionModalOpen,
  onOpenNewTaskModalFromNote,
}) => {
    const { t } = useI18n();
  return (
    <div className="flex flex-col gap-y-2 w-full md:w-78 md:flex-shrink-0 crm-left-col">
      <div className="flex justify-center md:justify-between items-center relative">
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-1 absolute left-0 md:relative md:left-auto"
        >
          <div className="size-6 hidden md:block">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.8273 11.9993L15.7773 16.9493L14.3633 18.3633L7.99934 11.9993L14.3633 5.63528L15.7773 7.04928L10.8273 11.9993Z" fill="#169600"/>
            </svg>
          </div>
          <div className="md:hidden block p-1.5 rounded-full bg-dream-secondary">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16.668 10.2285C16.668 10.5449 16.4328 10.8064 16.1278 10.8478L16.043 10.8535L3.54297 10.8535C3.19779 10.8535 2.91797 10.5737 2.91797 10.2285C2.91797 9.9121 3.1531 9.65061 3.45816 9.60922L3.54297 9.60352L16.043 9.60352C16.3881 9.60352 16.668 9.88334 16.668 10.2285Z" fill="#151515"/>
              <path d="M9.02302 14.8069C9.26762 15.0505 9.26848 15.4462 9.02492 15.6908C8.80351 15.9132 8.45634 15.9341 8.21127 15.7531L8.14104 15.6927L3.09938 10.6727C2.87634 10.4506 2.85606 10.1022 3.03852 9.85715L3.09934 9.78696L8.14101 4.76613C8.38559 4.52256 8.78132 4.52338 9.02489 4.76796C9.24632 4.99031 9.26577 5.33757 9.08372 5.58187L9.02306 5.65184L4.42636 10.2301L9.02302 14.8069Z" fill="#151515"/>
            </svg>
          </div>
          <span className="text-lg font-normal text-dream-primary md:block hidden">{t('crm.crm.leftSidebar.выйти_из_crm')}</span>
        </button>
        <span className="text-[28px] font-[700] text-black">CRM</span>
      </div>
      <ReportsBlock tasks={backendTasks} leads={backendLeads} onModalOpen={handleCloseOverlay} />
      <div className="mt-4 md:hidden">
        <TasksBlock
          tasks={backendTasks}
          lastUpdateTime={lastUpdateTime}
          onUpdateTaskStatus={updateTaskStatus}
          onDeleteTask={handleDeleteTask}
          onOpenNewTaskModal={handleOpenNewTaskModal}
          onOpenTaskManagementModal={handleOpenTaskManagementModal}
          onTaskUpdate={handleTaskUpdate}
          onUpdateTaskEndDate={updateTaskEndDate}
        />
      </div>
      <div className="mt-4">
        <LibrarySelectorBlock productType={selectedProductForLibrary === 'Net' ? ProductType.NETWORK : selectedProductForLibrary === 'Owner' ? ProductType.OWNER : selectedProductForLibrary === 'Agent' ? ProductType.AGENT : ProductType.SALES} onModalOpen={handleCloseOverlay} />
      </div>
      <div className="mt-4 relative">
        <CalendarBlock onModalOpen={handleCloseOverlay} />
      </div>
      <div className="mt-4 md:hidden">
        <NotificationsBlock />
      </div>
      <div className="mt-4">
        <NotesBlock onOpenNewTaskModalFromNote={onOpenNewTaskModalFromNote} />
      </div>
      <div className="mt-4 md:hidden">
        <LeadsBlock
          backendLeads={backendLeads}
          onUpdateLeads={handleUpdateLeads}
          onUpdateLead={handleUpdateLead}
          onUpdateLeadAfterSync={handleUpdateLeadAfterSync}
          onLoadLeads={loadLeads}
          onLeadStageChange={handleLeadStageChange}
          onOpenNewTaskModal={handleOpenNewTaskModalWithLead}
          onOpenTaskManagementModal={handleOpenTaskManagementModal}
          activeLeadId={leadStageOverlay?.leadId}
          onLeadDeleted={handleLeadDeleted}
          onProductChange={(product) => {
            setSelectedProductForLibrary(product);
          }}
        />
      </div>
      <div className="mt-4 mb-5">
        <AskQuestionButton onClick={() => setIsAskQuestionModalOpen(true)} />
      </div>
    </div>
  );
};
