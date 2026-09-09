import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { exportApi, type ExportEntity } from '@/services/exportApi';

interface ExportButtonProps {
  entity: ExportEntity;
  label?: string;
  className?: string;
  variant?: 'outline' | 'default' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ExportButton({
  entity,
  label = 'Экспорт в Excel',
  className,
  variant = 'outline',
  size = 'sm',
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    try {
      setLoading(true);
      setError(null);
      await exportApi.downloadExport(entity);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось выгрузить данные';
      setError(msg);
      // alert or toast fallback
      alert(`Ошибка выгрузки: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleExport}
      disabled={loading}
      className={className}
      title={error ? `Ошибка: ${error}` : label}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[color:var(--gold)]" />
      ) : (
        <FileSpreadsheet className="mr-2 h-4 w-4 text-[color:var(--gold)]" />
      )}
      <span>{loading ? 'Формирование...' : label}</span>
    </Button>
  );
}
