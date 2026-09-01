/**
 * Утилиты для сравнения данных без дерганий интерфейса
 */

/**
 * Сравнивает два массива объектов по ключевым полям
 * @param oldArray Старый массив
 * @param newArray Новый массив
 * @param keyField Поле для идентификации объектов (по умолчанию '_id')
 * @param compareFields Поля для сравнения (если не указаны, сравниваются все поля)
 * @returns true если массивы идентичны, false если есть изменения
 */
export function compareArrays<T extends Record<string, any>>(
  oldArray: T[],
  newArray: T[],
  keyField: string = '_id',
  compareFields?: string[]
): boolean {
  if (oldArray.length !== newArray.length) {
    return false;
  }

  const oldMap = new Map<string, T>();
  oldArray.forEach(item => {
    const key = String(item[keyField]);
    oldMap.set(key, item);
  });

  for (const newItem of newArray) {
    const key = String(newItem[keyField]);
    const oldItem = oldMap.get(key);
    
    if (!oldItem) {
      return false; // Новый элемент
    }

    if (!compareObjects(oldItem, newItem, compareFields)) {
      return false; // Элемент изменился
    }
  }

  return true;
}

/**
 * Сравнивает два объекта по указанным полям
 * @param oldObj Старый объект
 * @param newObj Новый объект
 * @param fields Поля для сравнения (если не указаны, сравниваются все поля)
 * @returns true если объекты идентичны, false если есть изменения
 */
export function compareObjects<T extends Record<string, any>>(
  oldObj: T,
  newObj: T,
  fields?: string[]
): boolean {
  if (!oldObj || !newObj) {
    return oldObj === newObj;
  }

  const fieldsToCompare = fields || Object.keys({ ...oldObj, ...newObj });

  for (const field of fieldsToCompare) {
    const oldValue = oldObj[field];
    const newValue = newObj[field];

    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      if (oldValue.length !== newValue.length) {
        return false;
      }
      // Для массивов примитивов - простое сравнение
      if (oldValue.length > 0 && typeof oldValue[0] !== 'object') {
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          return false;
        }
      } else {
        // Для массивов объектов - сравниваем по ключевым полям
        if (!compareArrays(oldValue, newValue)) {
          return false;
        }
      }
    } else if (typeof oldValue === 'object' && oldValue !== null && typeof newValue === 'object' && newValue !== null) {
      // Для вложенных объектов - рекурсивное сравнение
      if (!compareObjects(oldValue, newValue)) {
        return false;
      }
    } else {
      // Для примитивов - простое сравнение
      if (oldValue !== newValue) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Сравнивает задачи по ключевым полям
 */
export function compareTasks(oldTask: any, newTask: any): boolean {
  if (!oldTask || !newTask) return oldTask === newTask;
  
  return (
    oldTask._id === newTask._id &&
    oldTask.title === newTask.title &&
    oldTask.status === newTask.status &&
    oldTask.priority === newTask.priority &&
    oldTask.startDate === newTask.startDate &&
    oldTask.endDate === newTask.endDate &&
    oldTask.description === newTask.description &&
    JSON.stringify(oldTask.subtasks) === JSON.stringify(newTask.subtasks)
  );
}

/**
 * Сравнивает лиды по ключевым полям
 */
export function compareLeads(oldLead: any, newLead: any): boolean {
  if (!oldLead || !newLead) return oldLead === newLead;
  
  return (
    oldLead._id === newLead._id &&
    oldLead.name === newLead.name &&
    oldLead.stage === newLead.stage &&
    oldLead.productType === newLead.productType &&
    oldLead.phone === newLead.phone &&
    oldLead.email === newLead.email &&
    oldLead.notes === newLead.notes
  );
}

/**
 * Сравнивает события календаря по ключевым полям
 */
export function compareCalendarEvents(oldEvent: any, newEvent: any): boolean {
  if (!oldEvent || !newEvent) return oldEvent === newEvent;
  
  // Сравниваем основные поля
  if (
    oldEvent._id !== newEvent._id ||
    oldEvent.title !== newEvent.title ||
    oldEvent.startTime !== newEvent.startTime ||
    oldEvent.endTime !== newEvent.endTime ||
    oldEvent.type !== newEvent.type ||
    oldEvent.status !== newEvent.status ||
    oldEvent.description !== newEvent.description ||
    oldEvent.location !== newEvent.location ||
    oldEvent.meetingUrl !== newEvent.meetingUrl ||
    oldEvent.isAllDay !== newEvent.isAllDay ||
    oldEvent.isRecurring !== newEvent.isRecurring ||
    oldEvent.recurringRule !== newEvent.recurringRule
  ) {
    return false;
  }
  
  // Сравниваем leadId (может быть строкой или объектом)
  const oldLeadId = typeof oldEvent.leadId === 'object' ? oldEvent.leadId?._id : oldEvent.leadId;
  const newLeadId = typeof newEvent.leadId === 'object' ? newEvent.leadId?._id : newEvent.leadId;
  if (oldLeadId !== newLeadId) {
    return false;
  }
  
  // Сравниваем taskId (может быть строкой или объектом)
  const oldTaskId = typeof oldEvent.taskId === 'object' ? oldEvent.taskId?._id : oldEvent.taskId;
  const newTaskId = typeof newEvent.taskId === 'object' ? newEvent.taskId?._id : newEvent.taskId;
  if (oldTaskId !== newTaskId) {
    return false;
  }
  
  // Сравниваем массивы
  if (JSON.stringify(oldEvent.participants || []) !== JSON.stringify(newEvent.participants || [])) {
    return false;
  }
  if (JSON.stringify(oldEvent.externalParticipants || []) !== JSON.stringify(newEvent.externalParticipants || [])) {
    return false;
  }
  if (JSON.stringify(oldEvent.reminderMinutes || []) !== JSON.stringify(newEvent.reminderMinutes || [])) {
    return false;
  }
  
  return true;
}

/**
 * Сравнивает уведомления по ключевым полям
 */
export function compareNotifications(oldNotif: any, newNotif: any): boolean {
  if (!oldNotif || !newNotif) return oldNotif === newNotif;
  
  return (
    oldNotif._id === newNotif._id &&
    oldNotif.title === newNotif.title &&
    oldNotif.message === newNotif.message &&
    oldNotif.isRead === newNotif.isRead &&
    oldNotif.type === newNotif.type
  );
}

