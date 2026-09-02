import { useState, useEffect, useCallback, useRef } from 'react';
import {
  apiService,
  TaskPriority,
  TaskStatus,
} from '../services/api';
import type {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
  Lead
} from '../services/api';
import { useI18n } from "@/i18n";

interface TasksComponentProps {
  selectedLead?: Lead | null;
}

const priorityLabels = {
  [TaskPriority.URGENT_IMPORTANT]: 'Срочно и важно',
  [TaskPriority.NOT_URGENT_IMPORTANT]: 'Не срочно, но важно',
  [TaskPriority.URGENT_NOT_IMPORTANT]: 'Срочно, но не важно',
  [TaskPriority.NOT_URGENT_NOT_IMPORTANT]: 'Не срочно и не важно',
};

const statusLabels = {
  [TaskStatus.PENDING]: 'В ожидании',
  [TaskStatus.IN_PROGRESS]: 'В работе',
  [TaskStatus.COMPLETED]: 'Выполнено',
  [TaskStatus.CANCELLED]: 'Отменено',
};

const priorityColors = {
  [TaskPriority.URGENT_IMPORTANT]: 'bg-red-100 text-red-800',
  [TaskPriority.NOT_URGENT_IMPORTANT]: 'bg-yellow-100 text-yellow-800',
  [TaskPriority.URGENT_NOT_IMPORTANT]: 'bg-orange-100 text-orange-800',
  [TaskPriority.NOT_URGENT_NOT_IMPORTANT]: 'bg-gray-100 text-gray-800',
};

const statusColors = {
  [TaskStatus.PENDING]: 'bg-blue-100 text-blue-800',
  [TaskStatus.IN_PROGRESS]: 'bg-yellow-100 text-yellow-800',
  [TaskStatus.COMPLETED]: 'bg-green-100 text-green-800',
  [TaskStatus.CANCELLED]: 'bg-red-100 text-red-800',
};

export const TasksComponent = ({ selectedLead }: TasksComponentProps) => {
    const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<CreateTaskDto>({
    title: '',
    description: '',
    priority: TaskPriority.NOT_URGENT_IMPORTANT,
    assignedTo: '690ca643abbceba815ba7090',
    endDate: '',
  });

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiService.getTasks({
        page: 1,
        limit: 50,
        leadId: selectedLead?._id,
      });

      if (response.success && response.data) {
        setTasks(response.data.items);
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedLead?._id]);

  useEffect(() => {
    loadTasks();
  }, [selectedLead, loadTasks]);

  const handleCreateTask = async () => {
    try {
      setIsUploading(true);
      
      const taskData = {
        ...formData,
        leadId: selectedLead?._id,
      };

      const response = await apiService.createTask(taskData);

      if (response.success && response.data) {
        const newTask = response.data;
        
        if (selectedFiles.length > 0) {
          try {
            await apiService.uploadAndRegisterFilesBulk(
              selectedFiles,
              'task',
              newTask._id,
              'tasks'
            );
          } catch (error) {
            console.error('Failed to upload files:', error);
          }
        }
        
        setShowCreateModal(false);
        setFormData({
          title: '',
          description: '',
          priority: TaskPriority.NOT_URGENT_IMPORTANT,
          assignedTo: '690ca643abbceba815ba7090',
          endDate: '',
        });
        setSelectedFiles([]);
        loadTasks();
      }
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const filesArray = Array.from(files);
    
    if (filesArray.length > 10) {
      alert('Можно загрузить максимум 10 файлов за раз');
      return;
    }

    setSelectedFiles(filesArray);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleUpdateTask = async (taskId: string, updates: UpdateTaskDto) => {
    try {
      const response = await apiService.updateTask(taskId, updates);

      if (response.success) {
        loadTasks();
      }
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm('Вы уверены, что хотите удалить эту задачу?')) {
      try {
        const response = await apiService.deleteTask(taskId);

        if (response.success) {
          loadTasks();
        }
      } catch (error) {
        console.error('Failed to delete task:', error);
      }
    }
  };

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    await handleUpdateTask(task._id, { status: newStatus });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-normal text-gray-900">
          {t('crm.tasksComponent.задачи')}{selectedLead && `для ${selectedLead.name}`}
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {t('crm.tasksComponent.создать_задачу')}</button>
      </div>

      <div className="grid gap-4">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {t('crm.tasksComponent.задач_пока_нет')}</div>
        ) : (
          tasks.map((task) => (
            <div key={task._id} className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-normal text-gray-900">{task.title}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingTask(task)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    {t('crm.tasksComponent.изменить')}</button>
                  <button
                    onClick={() => handleDeleteTask(task._id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    {t('crm.tasksComponent.удалить')}</button>
                </div>
              </div>

              {task.description && (
                <p className="text-gray-600 mb-3">{task.description}</p>
              )}

              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority]}`}>
                  {priorityLabels[task.priority]}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[task.status]}`}>
                  {statusLabels[task.status]}
                </span>
              </div>

              {task.endDate && (
                <p className="text-sm text-gray-500 mb-3">
                  {t('crm.tasksComponent.до')}{new Date(task.endDate).toLocaleDateString('ru-RU')}
                </p>
              )}

              <div className="flex gap-2">
                {task.status !== TaskStatus.COMPLETED && (
                  <button
                    onClick={() => handleStatusChange(task, TaskStatus.COMPLETED)}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors"
                  >
                    {t('crm.tasksComponent.завершить')}</button>
                )}
                {task.status === TaskStatus.PENDING && (
                  <button
                    onClick={() => handleStatusChange(task, TaskStatus.IN_PROGRESS)}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm transition-colors"
                  >
                    {t('crm.tasksComponent.взять_в_работу')}</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-normal mb-4">{t('crm.tasksComponent.создать_задачу')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.tasksComponent.название')}</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('crm.tasksComponent.введите_название_зад')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.tasksComponent.описание')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('crm.tasksComponent.описание_задачи')}
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.tasksComponent.приоритет')}</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.tasksComponent.срок_выполнения')}</label>
                <input
                  type="datetime-local"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.tasksComponent.файлы_макс_10_файлов')}</label>
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  ref={fileInputRef}
                  accept="*/*"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-300 rounded-md px-3 py-4 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m14-7l-5-5m0 0L7 8m5-5v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t('crm.tasksComponent.выбрать_файлы')}</button>
                
                {selectedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-500">{t('crm.tasksComponent.выбрано_файлов')}{selectedFiles.length}</p>
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 rounded-md p-2 border border-gray-200">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5l-4-4z" fill="#4B5563"/>
                            <path d="M9 1v4h4" fill="#9CA3AF"/>
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(index)}
                          className="ml-2 p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title={t('crm.tasksComponent.удалить')}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setSelectedFiles([]);
                }}
                disabled={isUploading}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('crm.tasksComponent.отмена')}</button>
              <button
                onClick={handleCreateTask}
                disabled={!formData.title.trim() || isUploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('crm.tasksComponent.создание')}</>
                ) : (
                  'Создать'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-normal mb-4">{t('crm.tasksComponent.редактировать_задачу')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.tasksComponent.название')}</label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.tasksComponent.описание')}</label>
                <textarea
                  value={editingTask.description || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.tasksComponent.приоритет')}</label>
                <select
                  value={editingTask.priority}
                  onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as TaskPriority })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.tasksComponent.статус')}</label>
                <select
                  value={editingTask.status}
                  onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value as TaskStatus })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.tasksComponent.срок_выполнения')}</label>
                <input
                  type="datetime-local"
                  value={editingTask.endDate ? new Date(editingTask.endDate).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditingTask({ ...editingTask, endDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingTask(null)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t('crm.tasksComponent.отмена')}</button>
              <button
                onClick={async () => {
                  await handleUpdateTask(editingTask._id, {
                    title: editingTask.title,
                    description: editingTask.description,
                    priority: editingTask.priority,
                    status: editingTask.status,
                    endDate: editingTask.endDate,
                  });
                  setEditingTask(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                {t('crm.tasksComponent.сохранить')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
