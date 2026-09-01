export interface ModificationState<T> {
  data: T;
  modifiedFields: Set<string>;
  lastSyncedVersion?: T;
  isLocallyModified: boolean;
  lastModifiedAt: number;
  lastUserModifiedAt?: number; // Время последнего изменения пользователем
}

export class DataSyncManager<T extends { _id: string }> {
  private modifications = new Map<string, ModificationState<T>>();
  private deletedItems = new Map<string, number>(); // ID -> timestamp удаления

  initialize(items: T[]): void {
    items.forEach(item => {
      if (!this.modifications.has(item._id)) {
        this.modifications.set(item._id, {
          data: item,
          modifiedFields: new Set(),
          lastSyncedVersion: item,
          isLocallyModified: false,
          lastModifiedAt: Date.now(),
        });
      }
    });
  }

  trackModification(id: string, field: string, newData: Partial<T>): void {
    const state = this.modifications.get(id);
    if (!state) {
      return;
    }

    state.modifiedFields.add(field);
    state.isLocallyModified = true;
    state.lastModifiedAt = Date.now();
    state.lastUserModifiedAt = Date.now(); // Отмечаем время изменения пользователем
    state.data = { ...state.data, ...newData } as T;
  }

  syncFromBackend(backendItems: T[], blockUpdateDelay: number = 3000, deletedItemBlockDelay: number = 30000): { data: T[]; hasChanges: boolean } {
    const result: T[] = [];
    const processedIds = new Set<string>();
    let hasChanges = false;
    const now = Date.now();

    // Очищаем старые записи об удалении (старше deletedItemBlockDelay)
    this.deletedItems.forEach((timestamp, id) => {
      if (now - timestamp > deletedItemBlockDelay) {
        this.deletedItems.delete(id);
      }
    });

    backendItems.forEach(backendItem => {
      // Проверяем, не была ли эта задача недавно удалена ПЕРЕД обработкой
      const deletedAt = this.deletedItems.get(backendItem._id);
      if (deletedAt && (now - deletedAt) < deletedItemBlockDelay) {
        // Задача была недавно удалена - игнорируем её при синхронизации
        return; // Не добавляем в processedIds и не обрабатываем
      }
      
      processedIds.add(backendItem._id);
      
      const localState = this.modifications.get(backendItem._id);

      // Проверяем, не было ли недавнего изменения пользователем (блокировка на 3 секунды)
      // Блокировка применяется независимо от того, есть ли локальные модификации
      if (localState?.lastUserModifiedAt) {
        const timeSinceUserModification = now - localState.lastUserModifiedAt;
        if (timeSinceUserModification < blockUpdateDelay) {
          // Пропускаем обновление, используем текущие локальные данные
          // Это предотвращает перезапись данных, которые пользователь только что изменил
          result.push(localState.data);
          return;
        }
      }

      if (!localState || !localState.isLocallyModified) {
        // Если это новая задача (нет localState), проверяем, не была ли она недавно удалена
        if (!localState) {
          const deletedAt = this.deletedItems.get(backendItem._id);
          if (deletedAt && (now - deletedAt) < deletedItemBlockDelay) {
            // Задача была недавно удалена - не добавляем её обратно
            return;
          }
        }
        
        // Проверяем, изменились ли данные
        if (localState) {
          const currentData = localState.data;
          const dataChanged = JSON.stringify(currentData) !== JSON.stringify(backendItem);
          if (dataChanged) {
            hasChanges = true;
          }
        } else {
          // Новый элемент - это изменение
          hasChanges = true;
        }
        
        this.modifications.set(backendItem._id, {
          data: backendItem,
          modifiedFields: new Set(),
          lastSyncedVersion: backendItem,
          isLocallyModified: false,
          lastModifiedAt: Date.now(),
        });
        result.push(backendItem);
        return;
      }

      const mergedItem = this.mergeData(backendItem, localState);
      // Проверяем, изменился ли mergedItem по сравнению с текущими данными
      const currentData = localState.data;
      const dataChanged = JSON.stringify(currentData) !== JSON.stringify(mergedItem);
      if (dataChanged) {
        hasChanges = true;
      }
      
      this.modifications.set(backendItem._id, {
        data: mergedItem,
        modifiedFields: localState.modifiedFields,
        lastSyncedVersion: backendItem,
        isLocallyModified: localState.modifiedFields.size > 0,
        lastModifiedAt: localState.lastModifiedAt,
        lastUserModifiedAt: localState.lastUserModifiedAt, // Сохраняем время последнего изменения пользователем
      });
      result.push(mergedItem);
    });

    // Проверяем, были ли удалены элементы
    const currentIds = new Set(Array.from(this.modifications.keys()));
    const newIds = new Set(processedIds);
    if (currentIds.size !== newIds.size) {
      hasChanges = true;
    } else {
      for (const id of currentIds) {
        if (!newIds.has(id)) {
          hasChanges = true;
          break;
        }
      }
    }

    // Добавляем только те элементы, которые не были удалены недавно
    this.modifications.forEach((state, id) => {
      if (!processedIds.has(id)) {
        // Проверяем, не была ли эта задача недавно удалена
        const deletedAt = this.deletedItems.get(id);
        if (!deletedAt || (now - deletedAt) >= deletedItemBlockDelay) {
          result.push(state.data);
        } else {
          // Задача была недавно удалена - не добавляем её обратно
        }
      }
    });

    return { data: result, hasChanges };
  }

  private mergeData(backendItem: T, localState: ModificationState<T>): T {
    const merged = { ...backendItem };
    const modifiedFieldsArray = Array.from(localState.modifiedFields);

    modifiedFieldsArray.forEach(field => {
      const localValue = (localState.data as any)[field];
      const backendValue = (backendItem as any)[field];
      const syncedValue = localState.lastSyncedVersion 
        ? (localState.lastSyncedVersion as any)[field] 
        : undefined;

      if (JSON.stringify(backendValue) !== JSON.stringify(syncedValue)) {
        if (JSON.stringify(localValue) === JSON.stringify(syncedValue)) {
          (merged as any)[field] = backendValue;
          localState.modifiedFields.delete(field);
        } else {
          (merged as any)[field] = localValue;
        }
      } else {
        (merged as any)[field] = localValue;
      }
    });

    return merged;
  }

  clearModifications(id: string): void {
    const state = this.modifications.get(id);
    if (state) {
      state.modifiedFields.clear();
      state.isLocallyModified = false;
      state.lastSyncedVersion = state.data;
      // НЕ сбрасываем lastUserModifiedAt при очистке модификаций
      // Блокировка должна оставаться активной
    }
  }

  updateItemAfterSync(id: string, syncedItem: T): boolean {
    const state = this.modifications.get(id);
    if (state) {
      // Проверяем, изменились ли данные по сравнению с текущими
      const currentData = state.data;
      const dataChanged = JSON.stringify(currentData) !== JSON.stringify(syncedItem);
      
      // Обновляем данные только если они действительно изменились
      if (dataChanged) {
        state.data = syncedItem;
        state.lastSyncedVersion = syncedItem;
        state.modifiedFields.clear();
        state.isLocallyModified = false;
        // НЕ сбрасываем lastUserModifiedAt - оставляем блокировку на 3 секунды
        // Это предотвратит перезапись данных автообновлением
        return true; // Данные изменились
      } else {
        // Данные не изменились, просто очищаем флаги модификаций
        state.modifiedFields.clear();
        state.isLocallyModified = false;
        state.lastSyncedVersion = syncedItem;
        // НЕ сбрасываем lastUserModifiedAt - оставляем блокировку на 3 секунды
        // Это предотвратит перезапись данных автообновлением
        return false; // Данные не изменились
      }
    }
    return false;
  }

  getModifiedFields(id: string): string[] {
    return Array.from(this.modifications.get(id)?.modifiedFields || []);
  }

  isModified(id: string): boolean {
    return this.modifications.get(id)?.isLocallyModified || false;
  }

  getData(): T[] {
    return Array.from(this.modifications.values()).map(state => state.data);
  }

  getItem(id: string): T | undefined {
    return this.modifications.get(id)?.data;
  }

  removeItem(id: string): void {
    this.modifications.delete(id);
    // Отмечаем время удаления, чтобы предотвратить возврат задачи при синхронизации
    this.deletedItems.set(id, Date.now());
  }

  addItem(item: T): void {
    // Очищаем запись об удалении, если задача была восстановлена
    this.deletedItems.delete(item._id);
    
    this.modifications.set(item._id, {
      data: item,
      modifiedFields: new Set(),
      lastSyncedVersion: item,
      isLocallyModified: false,
      lastModifiedAt: Date.now(),
    });
  }
}
